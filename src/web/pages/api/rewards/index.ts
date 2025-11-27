/**
 * Rewards List API
 * 
 * GET /api/rewards
 * Returns user's current and past weekly rewards.
 * 
 * IMPORTANT: Does NOT expose future reward USD/TON amounts.
 * Only shows amounts for rewards with status = "paid".
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { getMystBalance, calculateRequiredBurn } from '../../../lib/myst-service';

interface RewardResponse {
  id: string;
  weekId: string;
  category: string;
  rank: number;
  status: 'pending_burn' | 'ready_for_payout' | 'paid';
  requiredMyst: number;
  burnedMyst: number;
  // Only included for paid rewards
  rewardUsd?: number;
  paidAt?: string;
}

type Data =
  | {
      ok: true;
      mystBalance: number;
      currentRewards: RewardResponse[];
      pastRewards: RewardResponse[];
    }
  | { ok: false; reason: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, reason: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await getUserFromRequest(req, prisma);
    if (!user) {
      return res.status(401).json({ ok: false, reason: 'Unauthorized' });
    }

    // Get MYST balance
    const mystBalance = await getMystBalance(prisma, user.id);

    // Get all rewards for this user
    const rewards = await prisma.leaderboardReward.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    // Separate current (unpaid) and past (paid) rewards
    const currentRewards: RewardResponse[] = [];
    const pastRewards: RewardResponse[] = [];

    for (const reward of rewards) {
      const baseResponse: RewardResponse = {
        id: reward.id,
        weekId: reward.weekId,
        category: reward.category,
        rank: reward.rank,
        status: reward.status as 'pending_burn' | 'ready_for_payout' | 'paid',
        requiredMyst: calculateRequiredBurn(reward.rewardUsd),
        burnedMyst: reward.burnedMyst,
      };

      if (reward.status === 'paid') {
        // For paid rewards, we can show the amount
        pastRewards.push({
          ...baseResponse,
          rewardUsd: reward.rewardUsd,
          paidAt: reward.paidAt?.toISOString(),
        });
      } else {
        // For unpaid rewards, do NOT show the USD amount
        currentRewards.push(baseResponse);
      }
    }

    return res.status(200).json({
      ok: true,
      mystBalance,
      currentRewards,
      pastRewards,
    });
  } catch (error: any) {
    console.error('[/api/rewards] Error:', error);
    return res.status(500).json({ ok: false, reason: 'Server error' });
  }
}

