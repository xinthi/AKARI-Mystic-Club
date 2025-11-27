/**
 * Admin: Mark Reward as Paid API
 * 
 * POST /api/admin/rewards/payout
 * Marks a reward as paid after admin sends TON manually.
 * 
 * Admin only - requires ADMIN_TELEGRAM_ID env var match.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { getUserFromRequest } from '../../../../lib/telegram-auth';

type Data =
  | {
      ok: true;
      rewardId: string;
      status: string;
      paidAt: string;
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

    // Admin check
    const adminTelegramId = process.env.ADMIN_TELEGRAM_ID;
    if (!adminTelegramId || user.telegramId !== adminTelegramId) {
      return res.status(403).json({ ok: false, reason: 'Admin only' });
    }

    const { rewardId, txHash } = req.body as {
      rewardId?: string;
      txHash?: string; // Optional TON transaction hash for reference
    };

    if (!rewardId) {
      return res.status(400).json({ ok: false, reason: 'Missing rewardId' });
    }

    // Get the reward
    const reward = await prisma.leaderboardReward.findUnique({
      where: { id: rewardId },
    });

    if (!reward) {
      return res.status(404).json({ ok: false, reason: 'Reward not found' });
    }

    if (reward.status !== 'ready_for_payout') {
      return res.status(400).json({
        ok: false,
        reason: `Reward status is "${reward.status}", must be "ready_for_payout"`,
      });
    }

    // Mark as paid
    const paidAt = new Date();
    await prisma.leaderboardReward.update({
      where: { id: rewardId },
      data: {
        status: 'paid',
        paidAt,
      },
    });

    console.log(
      `[Admin Payout] Marked reward ${rewardId} as paid. User: ${reward.userId}, Amount: $${reward.rewardUsd}`
    );

    return res.status(200).json({
      ok: true,
      rewardId,
      status: 'paid',
      paidAt: paidAt.toISOString(),
    });
  } catch (error: any) {
    console.error('[/api/admin/rewards/payout] Error:', error);
    return res.status(500).json({ ok: false, reason: error.message || 'Server error' });
  }
}

