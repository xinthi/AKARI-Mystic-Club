/**
 * Reward Claim API
 * 
 * POST /api/rewards/claim
 * Burns MYST to unlock a weekly TON reward.
 * 
 * Rules:
 * - User burns min(balance, requiredMyst)
 * - If balance < requiredMyst, user burns all and still gets reward
 * - At least 1 MYST must be burned if user has any balance
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { claimRewardWithBurn, getMystBalance } from '../../../lib/myst-service';

type Data =
  | {
      ok: true;
      burnedMyst: number;
      newBalance: number;
      status: string;
      message: string;
    }
  | { ok: false; reason: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await getUserFromRequest(req, prisma);
    if (!user) {
      return res.status(401).json({ ok: false, reason: 'Unauthorized' });
    }

    const { rewardId, tonWallet } = req.body as {
      rewardId?: string;
      tonWallet?: string;
    };

    if (!rewardId) {
      return res.status(400).json({ ok: false, reason: 'Missing rewardId' });
    }

    // Validate TON wallet format if provided (basic check)
    if (tonWallet && !/^(EQ|UQ)[a-zA-Z0-9_-]{46}$/.test(tonWallet)) {
      return res.status(400).json({ ok: false, reason: 'Invalid TON wallet format' });
    }

    // Process claim
    const result = await claimRewardWithBurn(
      prisma,
      user.id,
      rewardId,
      tonWallet
    );

    if (!result.success) {
      return res.status(400).json({ ok: false, reason: result.error || 'Claim failed' });
    }

    // Get new balance
    const newBalance = await getMystBalance(prisma, user.id);

    console.log(
      `[/api/rewards/claim] User ${user.telegramId} burned ${result.burnedAmount} MYST for reward ${rewardId}`
    );

    return res.status(200).json({
      ok: true,
      burnedMyst: result.burnedAmount,
      newBalance,
      status: 'ready_for_payout',
      message: 'MYST burned successfully. Your TON reward will be sent shortly.',
    });
  } catch (error: any) {
    console.error('[/api/rewards/claim] Error:', error);
    return res.status(500).json({ ok: false, reason: error.message || 'Server error' });
  }
}

