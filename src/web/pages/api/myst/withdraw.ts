/**
 * MYST Withdrawal Request API
 * 
 * POST /api/myst/withdraw
 * 
 * Allows users to withdraw MYST by burning it in exchange for TON.
 * Uses live TON price from Binance.
 * 
 * Economic model:
 * - 1 USD = 50 MYST (fixed)
 * - 1 MYST = 0.02 USD (fixed)
 * - TON price: live from Binance
 * - Fee: 2% of USD value
 * - Minimum: $50 USD gross
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getTonPriceUsd } from '../../../lib/ton-price';
import { MYST_PER_USD, USD_PER_MYST, getMystBalance, POOL_IDS } from '../../../lib/myst-service';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';

// Withdrawal constants
const WITHDRAW_FEE_RATE = 0.02;  // 2%
const MIN_WITHDRAW_USD = 50;     // minimum 50 USD

interface WithdrawResponse {
  ok: boolean;
  summary?: {
    mystBurned: number;
    tonPriceUsd: number;
    usdGross: number;
    usdFee: number;
    usdNet: number;
    tonAmount: number;
  };
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithdrawResponse>
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    // Get authenticated user
    const user = await getUserFromRequest(req, prisma);
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    // Get user's TON address
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { tonAddress: true },
    });

    if (!fullUser?.tonAddress) {
      return res.status(400).json({ 
        ok: false, 
        message: 'Please connect your TON wallet first' 
      });
    }

    // Read mystAmount from body
    const { mystAmount } = req.body as { mystAmount?: number };

    // Validate mystAmount
    if (!mystAmount || typeof mystAmount !== 'number' || mystAmount <= 0) {
      return res.status(400).json({ ok: false, message: 'Invalid MYST amount' });
    }

    // Check user's MYST balance
    const balance = await getMystBalance(prisma, user.id);
    if (balance < mystAmount) {
      return res.status(400).json({ 
        ok: false, 
        message: `Insufficient MYST balance. Have: ${balance.toFixed(2)}, Need: ${mystAmount.toFixed(2)}` 
      });
    }

    // Calculate USD value (1 MYST = 0.02 USD)
    const usdGross = mystAmount * USD_PER_MYST;

    // Enforce minimum USD
    if (usdGross < MIN_WITHDRAW_USD) {
      return res.status(400).json({
        ok: false,
        message: `Minimum withdrawal is ${MIN_WITHDRAW_USD} USD (requested ≈ ${usdGross.toFixed(2)} USD)`,
      });
    }

    // Apply 2% fee
    const usdFee = usdGross * WITHDRAW_FEE_RATE;
    const usdNet = usdGross - usdFee;

    // Fetch live TON price
    const tonPriceUsd = await getTonPriceUsd();
    const tonAmount = usdNet / tonPriceUsd;

    // Create withdrawal in transaction
    const withdrawal = await prisma.$transaction(async (tx) => {
      // Burn the full mystAmount from user's ledger
      await tx.mystTransaction.create({
        data: {
          userId: user.id,
          type: 'withdraw_burn',
          amount: -mystAmount,
          meta: JSON.parse(JSON.stringify({
            purpose: 'withdrawal',
            usdGross,
            usdFee,
            usdNet,
            tonPriceUsd,
            tonAmount,
          })),
        },
      });

      // Credit fee to treasury pool
      await tx.poolBalance.upsert({
        where: { id: POOL_IDS.TREASURY },
        update: { balance: { increment: usdFee * MYST_PER_USD } }, // Convert fee back to MYST for pool
        create: { id: POOL_IDS.TREASURY, balance: usdFee * MYST_PER_USD },
      });

      // Create withdrawal request record
      const req = await tx.withdrawalRequest.create({
        data: {
          userId: user.id,
          tonAddress: fullUser.tonAddress!,
          mystRequested: mystAmount,
          mystFee: usdFee * MYST_PER_USD, // Fee in MYST terms
          mystBurn: mystAmount,
          usdNet,
          tonAmount,
          tonPriceUsd,
          status: 'pending',
        },
      });

      return req;
    });

    console.log(`[Withdraw] Created: ${withdrawal.id} | ${mystAmount} MYST → ${tonAmount.toFixed(4)} TON @ $${tonPriceUsd.toFixed(2)}/TON`);

    return res.status(200).json({
      ok: true,
      summary: {
        mystBurned: mystAmount,
        tonPriceUsd,
        usdGross,
        usdFee,
        usdNet,
        tonAmount,
      },
      message: 'Withdrawal request created. Admin will process your TON payout manually.',
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Withdraw] Failed:', message);
    return res.status(500).json({ ok: false, message: 'Failed to create withdrawal' });
  }
}
