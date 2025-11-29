/**
 * TON Deposit Intent API
 * 
 * POST /api/ton/deposit-intent
 * 
 * Creates a pending deposit record when user indicates they want to deposit TON.
 * Does NOT credit MYST - that happens when the on-chain TX is verified.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { getTonPriceUsd } from '../../../lib/ton-price';
import { MYST_PER_USD } from '../../../lib/myst-service';

interface DepositIntentResponse {
  ok: boolean;
  deposit?: {
    id: string;
    treasuryAddress: string;
    memo: string;
    tonAmount: number;
    tonPriceUsd: number;
    usdValue: number;
    mystEstimate: number;
  };
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DepositIntentResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await getUserFromRequest(req, prisma);
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    const { tonAmount } = req.body;

    // Validate tonAmount
    if (!tonAmount || typeof tonAmount !== 'number' || tonAmount <= 0) {
      return res.status(400).json({ ok: false, message: 'Invalid TON amount' });
    }

    if (tonAmount < 0.1) {
      return res.status(400).json({ ok: false, message: 'Minimum deposit is 0.1 TON' });
    }

    // Get treasury address from env
    const treasuryAddress = process.env.TON_TREASURY_ADDRESS;
    if (!treasuryAddress) {
      console.error('[DepositIntent] TON_TREASURY_ADDRESS not configured');
      return res.status(500).json({ ok: false, message: 'Treasury not configured' });
    }

    // Get current TON price
    const tonPriceUsd = await getTonPriceUsd();

    // Calculate values
    const usdValue = tonAmount * tonPriceUsd;
    const mystEstimate = usdValue * MYST_PER_USD;

    // Generate memo for matching
    const memo = `AKARI:${user.id}`;

    // Create pending deposit record
    const deposit = await prisma.deposit.create({
      data: {
        userId: user.id,
        tonAmount,
        tonPriceUsd,
        usdAmount: usdValue,
        mystEstimate,
        memo,
        status: 'pending',
      },
    });

    console.log(`[DepositIntent] Created deposit intent: ${deposit.id} for user ${user.id}, ${tonAmount} TON`);

    return res.status(200).json({
      ok: true,
      deposit: {
        id: deposit.id,
        treasuryAddress,
        memo,
        tonAmount,
        tonPriceUsd,
        usdValue,
        mystEstimate,
      },
    });
  } catch (error: any) {
    console.error('[DepositIntent] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

