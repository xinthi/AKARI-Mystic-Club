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
 * IMPORTANT: Does NOT expose future reward USD/TON amounts.
 * Only shows eligibility badges.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserSpentInPeriod, getUserReferralEarningsInPeriod } from '../../../lib/myst-service';

type LeaderboardEntry = {
  rank: number;
  odIndex: string;
  username?: string;
  tier?: string;
  points: number;          // aXP (experience points)
  mystSpent?: number;      // MYST spent (for myst_spent leaderboard)
  referralEarnings?: number; // MYST earned from referrals
  credibilityScore?: number;
  positiveReviews?: number;
  completions?: number;
  rewardEligible?: boolean; // True if in top N for weekly rewards
};

type Data = {
  ok: boolean;
  leaderboard: LeaderboardEntry[];
  type: string;
  period: string;
  reason?: string;
};

// Get start of current week (Tuesday 23:00 UTC of previous week)
function getWeekStart(): Date {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const hoursUTC = now.getUTCHours();
  
  // Calculate days since last Tuesday 23:00 UTC
  let daysBack = (dayOfWeek + 5) % 7; // Days since Tuesday
  if (dayOfWeek === 2 && hoursUTC < 23) {
    daysBack = 7; // Before Tuesday 23:00, go to previous week
  }
  
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - daysBack);
  weekStart.setUTCHours(23, 0, 0, 0);
  
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
      
      const spentData = await prisma.mystTransaction.groupBy({
        by: ['userId'],
        where: {
          type: { in: ['bet', 'campaign_fee', 'boost'] },
          amount: { lt: 0 },
          createdAt: { gte: startTime, lte: now },
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'asc' } }, // Most negative = most spent
        take: 50,
      });

      // Get user details
      const userIds = spentData.map((d) => d.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, tier: true, points: true },
      });

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
          rewardEligible: idx < 10, // Top 10 are reward eligible
        };
      });

    } else if (type === 'referrals') {
      // Referral Earnings Leaderboard
      const startTime = period === 'week' ? weekStart : new Date(0);
      
      const referralData = await prisma.mystTransaction.groupBy({
        by: ['userId'],
        where: {
          type: 'referral_reward',
          amount: { gt: 0 },
          createdAt: { gte: startTime, lte: now },
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 50,
      });

      // Get user details
      const userIds = referralData.map((d) => d.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, tier: true, points: true },
      });

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
      const users = await prisma.user.findMany({
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
      });

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
  } catch (e: any) {
    console.error('Leaderboard API error:', e);
    res.status(500).json({
      ok: false,
      leaderboard: [],
      type: 'points',
      period: 'all',
      reason: 'Server error',
    });
  }
}
