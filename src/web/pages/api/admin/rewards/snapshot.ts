/**
 * Admin: Weekly Reward Snapshot API
 * 
 * POST /api/admin/rewards/snapshot
 * Creates leaderboard rewards for a given week.
 * 
 * This should be called after the weekly activity window ends.
 * It takes snapshots of top spenders, top referrers, etc.
 * 
 * Admin only - requires ADMIN_TELEGRAM_ID env var match.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { getUserFromRequest } from '../../../../lib/telegram-auth';
import {
  getTopSpenders,
  getTopReferrers,
  calculateRequiredBurn,
} from '../../../../lib/myst-service';

type Data =
  | {
      ok: true;
      weekId: string;
      rewardsCreated: number;
      summary: {
        topSpenders: number;
        topReferrers: number;
      };
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

    const {
      weekId,
      startTime,
      endTime,
      budgetTopSpenders = 500,
      budgetTopReferrers = 300,
      winnersPerCategory = 10,
    } = req.body as {
      weekId: string;
      startTime: string;
      endTime: string;
      budgetTopSpenders?: number;
      budgetTopReferrers?: number;
      winnersPerCategory?: number;
    };

    if (!weekId || !startTime || !endTime) {
      return res.status(400).json({
        ok: false,
        reason: 'Missing required fields: weekId, startTime, endTime',
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ ok: false, reason: 'Invalid date format' });
    }

    // Check if snapshot already exists for this week
    const existingRewards = await prisma.leaderboardReward.findFirst({
      where: { weekId },
    });

    if (existingRewards) {
      return res.status(400).json({
        ok: false,
        reason: `Snapshot already exists for week ${weekId}`,
      });
    }

    // Get top spenders
    const topSpenders = await getTopSpenders(prisma, start, end, winnersPerCategory);

    // Get top referrers
    const topReferrers = await getTopReferrers(prisma, start, end, winnersPerCategory);

    // Calculate reward distribution (linear decay)
    const distributeRewards = (budget: number, count: number): number[] => {
      if (count === 0) return [];
      // Simple distribution: 1st place gets most, linear decay
      // Total weight = 1 + 2 + 3 + ... + count = count * (count + 1) / 2
      const weights = Array.from({ length: count }, (_, i) => count - i);
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      return weights.map((w) => (budget * w) / totalWeight);
    };

    const spenderRewards = distributeRewards(budgetTopSpenders, topSpenders.length);
    const referrerRewards = distributeRewards(budgetTopReferrers, topReferrers.length);

    // Create reward records
    const rewardsToCreate = [];

    // Top spenders
    for (let i = 0; i < topSpenders.length; i++) {
      const rewardUsd = spenderRewards[i];
      rewardsToCreate.push({
        userId: topSpenders[i].userId,
        weekId,
        category: 'top_spender',
        rank: i + 1,
        rewardUsd,
        requiredMyst: calculateRequiredBurn(rewardUsd),
        status: 'pending_burn',
      });
    }

    // Top referrers
    for (let i = 0; i < topReferrers.length; i++) {
      const rewardUsd = referrerRewards[i];
      rewardsToCreate.push({
        userId: topReferrers[i].userId,
        weekId,
        category: 'top_referrer',
        rank: i + 1,
        rewardUsd,
        requiredMyst: calculateRequiredBurn(rewardUsd),
        status: 'pending_burn',
      });
    }

    // Insert all rewards
    await prisma.leaderboardReward.createMany({
      data: rewardsToCreate,
      skipDuplicates: true,
    });

    console.log(
      `[Admin Snapshot] Created ${rewardsToCreate.length} rewards for week ${weekId}`
    );

    return res.status(200).json({
      ok: true,
      weekId,
      rewardsCreated: rewardsToCreate.length,
      summary: {
        topSpenders: topSpenders.length,
        topReferrers: topReferrers.length,
      },
    });
  } catch (error: any) {
    console.error('[/api/admin/rewards/snapshot] Error:', error);
    return res.status(500).json({ ok: false, reason: error.message || 'Server error' });
  }
}

