/**
 * MYST Withdrawal Request API
 * 
 * POST /api/myst/withdraw
 * 
 * Allows users to withdraw MYST by burning it in exchange for USDT (on TON chain).
 * 
 * Economic model:
 * - 1 USD = 50 MYST (fixed)
 * - 1 MYST = 0.02 USD (fixed)
 * - USDT is 1:1 with USD
 * - Fee: 2% of USD value
 * - Minimum: $50 USD gross
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { MYST_PER_USD, USD_PER_MYST, getMystBalance, POOL_IDS } from '../../../lib/myst-service';
import { prisma, withDbRetry } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';

// Withdrawal constants
const WITHDRAW_FEE_RATE = 0.02;  // 2%
const MIN_WITHDRAW_USD = 50;     // minimum 50 USD

interface WithdrawResponse {
  ok: boolean;
  summary?: {
    mystBurned: number;
    usdGross: number;
    usdFee: number;
    usdNet: number;
    usdtAmount: number;
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

    // Get user's wallet address
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { tonAddress: true },
    });

    if (!fullUser?.tonAddress) {
      return res.status(400).json({ 
        ok: false, 
        message: 'Please connect your wallet first' 
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
    
    // USDT amount is 1:1 with USD
    const usdtAmount = usdNet;

    // Create withdrawal in transaction with retry logic
    const withdrawal = await withDbRetry(async () => {
      return await prisma.$transaction(async (tx) => {
      // Burn the full mystAmount from user's ledger
      await tx.mystTransaction.create({
        data: {
          userId: user.id,
          type: 'withdraw_burn',
          amount: -mystAmount,
          meta: JSON.parse(JSON.stringify({
            purpose: 'withdrawal_usdt',
            usdGross,
            usdFee,
            usdNet,
            usdtAmount,
          })),
        },
      });

      // Credit fee to treasury pool (convert fee back to MYST for pool)
      await tx.poolBalance.upsert({
        where: { id: POOL_IDS.TREASURY },
        update: { balance: { increment: usdFee * MYST_PER_USD } },
        create: { id: POOL_IDS.TREASURY, balance: usdFee * MYST_PER_USD },
      });

      // Create withdrawal request record
      const req = await tx.withdrawalRequest.create({
        data: {
          userId: user.id,
          tonAddress: fullUser.tonAddress!,
          mystRequested: mystAmount,
          mystFee: usdFee * MYST_PER_USD,
          mystBurn: mystAmount,
          usdNet,
          tonAmount: usdtAmount, // Storing USDT amount in tonAmount field for backward compat
          tonPriceUsd: 1.0, // USDT is always 1:1
          status: 'pending',
        },
      });

      return req;
      }, {
        maxWait: 10000,
        timeout: 30000,
      });
    });

    console.log(`[Withdraw] Created: ${withdrawal.id} | ${mystAmount} MYST → ${usdtAmount.toFixed(2)} USDT`);

    return res.status(200).json({
      ok: true,
      summary: {
        mystBurned: mystAmount,
        usdGross,
        usdFee,
        usdNet,
        usdtAmount,
      },
      message: 'Withdrawal request created. Admin will send USDT manually.',
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Withdraw] Failed:', message);
    return res.status(500).json({ ok: false, message: 'Failed to create withdrawal' });
  }
}
