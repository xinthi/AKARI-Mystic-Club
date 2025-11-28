/**
 * Wheel of Fortune Spin API
 * 
 * POST /api/wheel/spin
 * 
 * Allows users to spin the wheel once per UTC day.
 * Prize is randomly selected from tiers and deducted from WheelPool.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { 
  MYST_CONFIG, 
  getMystBalance, 
  getWheelPool, 
  deductFromWheelPool,
  creditMyst 
} from '../../../lib/myst-service';

interface SpinResponse {
  ok: boolean;
  prize?: number;
  newBalance?: number;
  poolBalance?: number;
  message?: string;
}

// Prize weights (higher = more likely)
// Index corresponds to MYST_CONFIG.WHEEL_PRIZES: [0, 0.1, 0.2, 0.5, 1, 3, 5, 10]
const PRIZE_WEIGHTS = [40, 25, 15, 10, 5, 3, 1.5, 0.5]; // Total: 100

/**
 * Select a random prize based on weights.
 * Will not select prizes higher than available pool balance.
 */
function selectPrize(poolBalance: number): number {
  const prizes = MYST_CONFIG.WHEEL_PRIZES;
  const weights = [...PRIZE_WEIGHTS];
  
  // Zero out weights for prizes that exceed pool balance
  for (let i = 0; i < prizes.length; i++) {
    if (prizes[i] > poolBalance) {
      weights[i] = 0;
    }
  }
  
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  
  if (totalWeight <= 0) {
    return 0; // Pool is empty, return 0
  }
  
  let random = Math.random() * totalWeight;
  
  for (let i = 0; i < prizes.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return prizes[i];
    }
  }
  
  return 0;
}

/**
 * Get start of current UTC day.
 */
function getUTCDayStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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

    // Check if user has already spun today
    const dayStart = getUTCDayStart();
    const existingSpin = await prisma.wheelSpin.findFirst({
      where: {
        userId: user.id,
        createdAt: { gte: dayStart },
      },
    });

    if (existingSpin) {
      const nextSpinTime = new Date(dayStart);
      nextSpinTime.setUTCDate(nextSpinTime.getUTCDate() + 1);
      
      return res.status(200).json({
        ok: false,
        message: `You've already spun today! Come back at ${nextSpinTime.toISOString()}`,
      });
    }

    // Get wheel pool balance
    const pool = await getWheelPool(prisma);
    
    if (pool.balance <= 0) {
      return res.status(200).json({
        ok: false,
        message: 'Wheel is currently empty. Try again later!',
        poolBalance: 0,
      });
    }

    // Select prize
    const prize = selectPrize(pool.balance);

    // Execute spin atomically
    await prisma.$transaction(async (tx) => {
      // Record the spin
      await tx.wheelSpin.create({
        data: {
          userId: user.id,
          amountWon: prize,
        },
      });

      // Deduct from pool (if prize > 0)
      if (prize > 0) {
        await tx.wheelPool.update({
          where: { id: 'main_pool' },
          data: { balance: { decrement: prize } },
        });

        // Credit user
        await tx.mystTransaction.create({
          data: {
            userId: user.id,
            type: 'wheel_win',
            amount: prize,
            meta: { source: 'wheel_spin' },
          },
        });
      }
    });

    // Get updated balances
    const newBalance = await getMystBalance(prisma, user.id);
    const updatedPool = await getWheelPool(prisma);

    const message = prize > 0 
      ? `🎉 You won ${prize} MYST!`
      : `Better luck next time!`;

    console.log(`[Wheel] User ${user.id} spun and won ${prize} MYST`);

    return res.status(200).json({
      ok: true,
      prize,
      newBalance,
      poolBalance: updatedPool.balance,
      message,
    });

  } catch (error: any) {
    console.error('[/api/wheel/spin] Error:', error);
    return res.status(500).json({ ok: false, message: 'Failed to spin the wheel' });
  }
}

