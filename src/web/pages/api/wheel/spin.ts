/**
 * Wheel of Fortune Spin API
 * 
 * POST /api/wheel/spin
 * 
 * Allows users to spin the wheel (2 spins per UTC day).
 * Prizes include both MYST and aXP.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { 
  MYST_CONFIG, 
  WHEEL_PRIZES,
  getMystBalance, 
  getWheelPoolBalance,
  getUserSpinsToday,
  selectWheelPrize,
  POOL_IDS,
} from '../../../lib/myst-service';

interface SpinResponse {
  ok: boolean;
  prize?: {
    type: 'myst' | 'axp';
    label: string;
    mystWon: number;
    axpWon: number;
  };
  newMystBalance?: number;
  newAxp?: number;
  poolBalance?: number;
  spinsRemaining?: number;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SpinResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await getUserFromRequest(req, prisma);
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Please open this app from Telegram' });
    }

    // Check spins remaining today
    const spinsToday = await getUserSpinsToday(prisma, user.id);
    const spinsRemaining = MYST_CONFIG.WHEEL_SPINS_PER_DAY - spinsToday;

    if (spinsRemaining <= 0) {
      const now = new Date();
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      
      return res.status(200).json({
        ok: false,
        message: `No spins left today! Come back at ${tomorrow.toISOString()}`,
        spinsRemaining: 0,
      });
    }

    // Get pool balance
    const poolBalance = await getWheelPoolBalance(prisma);

    // Get smallest MYST prize to check if pool can pay anything
    const smallestMystPrize = WHEEL_PRIZES
      .filter(p => p.type === 'myst' && p.myst > 0)
      .sort((a, b) => a.myst - b.myst)[0];
    
    const poolEffectivelyEmpty = smallestMystPrize && poolBalance < smallestMystPrize.myst;

    // Select prize
    const prize = selectWheelPrize(poolBalance);

    // Execute spin in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Record spin
      await tx.wheelSpin.create({
        data: {
          userId: user.id,
          prizeType: prize.type,
          mystWon: prize.myst,
          axpWon: prize.axp,
        },
      });

      // If MYST prize, deduct from pool and credit user
      if (prize.type === 'myst' && prize.myst > 0) {
        // Deduct from pool
        await tx.poolBalance.upsert({
          where: { id: POOL_IDS.WHEEL },
          update: { balance: { decrement: prize.myst } },
          create: { id: POOL_IDS.WHEEL, balance: 0 },
        });

        // Also update legacy WheelPool
        await tx.wheelPool.upsert({
          where: { id: 'main_pool' },
          update: { balance: { decrement: prize.myst } },
          create: { id: 'main_pool', balance: 0 },
        });

        // Credit user
        await tx.mystTransaction.create({
          data: {
            userId: user.id,
            type: 'wheel_prize',
            amount: prize.myst,
            meta: { source: 'wheel_spin', prizeLabel: prize.label },
          },
        });
      }

      // If aXP prize, credit user points
      if (prize.type === 'axp' && prize.axp > 0) {
        await tx.user.update({
          where: { id: user.id },
          data: { points: { increment: prize.axp } },
        });
      }

      // Get updated values
      const updatedUser = await tx.user.findUnique({
        where: { id: user.id },
        select: { points: true },
      });

      return { newAxp: updatedUser?.points ?? 0 };
    });

    // Get updated balances
    const newMystBalance = await getMystBalance(prisma, user.id);
    const updatedPoolBalance = await getWheelPoolBalance(prisma);

    const message = prize.type === 'myst' && prize.myst > 0
      ? `🎉 You won ${prize.myst} MYST!`
      : `✨ You gained +${prize.axp} aXP!`;

    console.log(`[Wheel] User ${user.id} spun: ${prize.label}`);

    return res.status(200).json({
      ok: true,
      prize: {
        type: prize.type,
        label: prize.label,
        mystWon: prize.myst,
        axpWon: prize.axp,
      },
      newMystBalance,
      newAxp: result.newAxp,
      poolBalance: updatedPoolBalance,
      spinsRemaining: spinsRemaining - 1,
      message,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Wheel] spin failed:', message);
    return res.status(500).json({ ok: false, message: 'Failed to spin the wheel' });
  }
}
