/**
 * USDT Deposit Intent API
 * 
 * POST /api/usdt/deposit-intent
 * 
 * Records a user's intent to deposit USDT (on TON chain).
 * Does not credit MYST - that's done by admin after confirmation.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';

// Fixed conversion rate
const MYST_PER_USDT = 50;

interface DepositIntentResponse {
  ok: boolean;
  deposit?: {
    id: string;
    treasuryAddress: string;
    memo: string;
    usdtAmount: number;
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
    const user = await getUserFromRequest(req, prisma);
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    const { usdtAmount } = req.body;
    
    if (!usdtAmount || typeof usdtAmount !== 'number' || usdtAmount < 1) {
      return res.status(400).json({ ok: false, message: 'Minimum deposit is 1 USDT' });
    }

    // Get treasury address from env
    const treasuryAddress = process.env.TON_TREASURY_ADDRESS || process.env.USDT_TREASURY_ADDRESS;
    if (!treasuryAddress) {
      console.error('[USDT/Deposit] Treasury address not configured');
      return res.status(500).json({ ok: false, message: 'Treasury not configured' });
    }

    // Calculate MYST estimate (1 USDT = 50 MYST)
    const mystEstimate = usdtAmount * MYST_PER_USDT;
    
    // Generate memo
    const memo = `AKARI:${user.id}`;

    // Create deposit record
    const deposit = await prisma.deposit.create({
      data: {
        userId: user.id,
        tonAmount: usdtAmount, // Storing as "tonAmount" for backward compat, but it's USDT
        tonPriceUsd: 1.0, // USDT is always 1:1 with USD
        usdAmount: usdtAmount, // Same as USDT amount
        mystEstimate,
        mystCredited: 0,
        memo,
        status: 'pending',
      },
    });

    console.log(`[USDT/Deposit] Created deposit intent:`, {
      depositId: deposit.id,
      userId: user.id,
      usdtAmount,
      mystEstimate,
      memo,
    });

    return res.status(200).json({
      ok: true,
      deposit: {
        id: deposit.id,
        treasuryAddress,
        memo,
        usdtAmount,
        mystEstimate,
      },
    });
  } catch (error: any) {
    console.error('[USDT/Deposit] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

