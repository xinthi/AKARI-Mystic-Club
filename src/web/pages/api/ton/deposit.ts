/**
 * TON Deposit Instructions API
 * 
 * GET /api/ton/deposit
 * 
 * Returns deposit instructions for user with live MYST conversion rates.
 * The actual deposit processing is done by an external watcher (not in this repo).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { MYST_PER_USD, getMystBalance } from '../../../lib/myst-service';
import { getTonPriceUsd } from '../../../lib/ton-price';

interface DepositResponse {
  ok: boolean;
  depositAddress?: string;
  memo?: string;
  rates?: {
    tonPriceUsd: number;
    mystPerUsd: number;
    mystPerTon: number;
  };
  preview?: {
    ton1: { usd: number; myst: number };
    ton5: { usd: number; myst: number };
    ton10: { usd: number; myst: number };
  };
  currentBalance?: number;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DepositResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await getUserFromRequest(req, prisma);
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    // Get treasury address from env
    const treasuryAddress = process.env.TON_TREASURY_ADDRESS;
    
    if (!treasuryAddress) {
      return res.status(200).json({
        ok: false,
        message: 'Deposits are not yet available. Please check back later.',
      });
    }

    // Generate memo for this user
    const memo = `AKARI:${user.id}`;

    // Get live TON price
    const tonPriceUsd = await getTonPriceUsd();
    const mystPerTon = tonPriceUsd * MYST_PER_USD;

    // Get current balance
    const currentBalance = await getMystBalance(prisma, user.id);

    // Calculate preview amounts
    const preview = {
      ton1: { 
        usd: tonPriceUsd * 1, 
        myst: mystPerTon * 1 
      },
      ton5: { 
        usd: tonPriceUsd * 5, 
        myst: mystPerTon * 5 
      },
      ton10: { 
        usd: tonPriceUsd * 10, 
        myst: mystPerTon * 10 
      },
    };

    return res.status(200).json({
      ok: true,
      depositAddress: treasuryAddress,
      memo,
      rates: {
        tonPriceUsd,
        mystPerUsd: MYST_PER_USD,
        mystPerTon,
      },
      preview,
      currentBalance,
      message: `Send TON to the address below with memo "${memo}" to receive MYST.`,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Deposit] Info failed:', message);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}
