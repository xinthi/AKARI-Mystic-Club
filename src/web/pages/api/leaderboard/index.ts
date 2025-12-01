/**
 * Leaderboard API
 * 
 * GET /api/leaderboard
 * Returns leaderboard data with multiple ranking types.
 * 
 * Query params:
 * - type: 'points' | 'myst_spent' | 'referrals' (default: 'points')
 * - period: 'all' | 'week' (default: 'all')
 * 
 * Rankings:
 * - myst_spent: Total MYST spent on bets, campaigns, boosts
 * - referrals: MYST earned from referral rewards (L1 + L2)
 * - points: aXP (experience points)
 * 
 * Note: Does NOT expose future reward amounts.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../lib/prisma';

interface LeaderboardEntry {
  rank: number;
  odIndex: string;
  username?: string;
  tier?: string;
  points: number;            // aXP (experience points)
  mystSpent?: number;        // MYST spent (for myst_spent leaderboard)
  referralEarnings?: number; // MYST earned from referrals
  credibilityScore?: number;
  positiveReviews?: number;
  completions?: number;
  rewardEligible?: boolean;  // True if in top 10 for weekly recognition
}

interface Data {
  ok: boolean;
  leaderboard: LeaderboardEntry[];
  type: string;
  period: string;
  reason?: string;
}

// Get start of current week (Monday 00:00 UTC)
function getWeekStart(): Date {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0 days back
  
  const weekStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysBack,
    0, 0, 0, 0
  ));
  
  return weekStart;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  try {
    const { type = 'points', period = 'all' } = req.query as {
      type?: string;
      period?: string;
    };

    // Calculate time range for weekly data
    const weekStart = getWeekStart();
    const now = new Date();

    let leaderboard: LeaderboardEntry[] = [];

    if (type === 'myst_spent') {
      // MYST Spent Leaderboard
      const startTime = period === 'week' ? weekStart : new Date(0);
      
      const spentData = await withDbRetry(() => prisma.mystTransaction.groupBy({
        by: ['userId'],
        where: {
          type: { in: ['spend_bet', 'spend_boost', 'spend_campaign', 'bet', 'campaign_fee', 'boost'] },
          amount: { lt: 0 },
          createdAt: { gte: startTime, lte: now },
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'asc' } }, // Most negative = most spent
        take: 50,
      }));

      // Get user details
      const userIds = spentData.map((d) => d.userId);
      const users = await withDbRetry(() => prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, tier: true, points: true },
      }));

      const userMap = new Map(users.map((u) => [u.id, u]));

      leaderboard = spentData.map((d, idx) => {
        const user = userMap.get(d.userId);
        return {
          rank: idx + 1,
          odIndex: d.userId,
          username: user?.username ?? 'Anonymous',
          tier: user?.tier ?? undefined,
          points: user?.points ?? 0,
          mystSpent: Math.abs(d._sum.amount ?? 0),
          rewardEligible: idx < 10, // Top 10 are highlighted
        };
      });

    } else if (type === 'referrals') {
      // Referral Earnings Leaderboard (MYST earned from referral rewards)
      const startTime = period === 'week' ? weekStart : new Date(0);
      
      const referralData = await withDbRetry(() => prisma.mystTransaction.groupBy({
        by: ['userId'],
        where: {
          type: { in: ['referral_reward_l1', 'referral_reward_l2', 'referral_reward'] },
          amount: { gt: 0 },
          createdAt: { gte: startTime, lte: now },
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 50,
      }));

      // Get user details
      const userIds = referralData.map((d) => d.userId);
      const users = await withDbRetry(() => prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, tier: true, points: true },
      }));

      const userMap = new Map(users.map((u) => [u.id, u]));

      leaderboard = referralData.map((d, idx) => {
        const user = userMap.get(d.userId);
        return {
          rank: idx + 1,
          odIndex: d.userId,
          username: user?.username ?? 'Anonymous',
          tier: user?.tier ?? undefined,
          points: user?.points ?? 0,
          referralEarnings: d._sum.amount ?? 0,
          rewardEligible: idx < 10,
        };
      });

    } else {
      // Default: Points (aXP) Leaderboard
      const users = await withDbRetry(() => prisma.user.findMany({
        where: { points: { gt: 0 } },
        orderBy: { points: 'desc' },
        take: 50,
        include: {
          _count: {
            select: {
              campaignsProgress: {
                where: { completed: true },
              },
            },
          },
        },
      }));

      leaderboard = users.map((u, idx) => ({
        rank: idx + 1,
        odIndex: u.id,
        username: u.username ?? 'Anonymous',
        tier: u.tier ?? undefined,
        points: u.points,
        credibilityScore: u.credibilityScore ?? undefined,
        positiveReviews: u.positiveReviews,
        completions: u._count.campaignsProgress,
        rewardEligible: idx < 10,
      }));
    }

    res.status(200).json({
      ok: true,
      leaderboard,
      type: type as string,
      period: period as string,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[Leaderboard] API error:', message);
    res.status(500).json({
      ok: false,
      leaderboard: [],
      type: 'points',
      period: 'all',
      reason: 'Server error',
    });
  }
}
