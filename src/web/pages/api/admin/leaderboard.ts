/**
 * Admin Leaderboard Analytics API
 * 
 * GET /api/admin/leaderboard
 * 
 * Returns leaderboard data for admins to analyze top players.
 * Supports filtering by metric (myst_spent, referrals, axp) and time period.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getMystBalance } from '../../../lib/myst-service';

type Metric = 'myst_spent' | 'referrals' | 'axp';
type Period = 'week' | 'month' | 'all';

interface LeaderboardRow {
  userId: string;
  telegramId: string | null;
  username: string | null;
  firstName: string | null;
  mystValue: number;
  referralCount: number;
  axpValue: number;
  mystBalance: number;
}

interface LeaderboardResponse {
  ok: boolean;
  metric?: Metric;
  period?: { from: string; to: string };
  rows?: LeaderboardRow[];
  total?: number;
  message?: string;
}

/**
 * Get the start and end of the current ISO week (Mon 00:00 UTC → Sun 23:59 UTC)
 */
function getCurrentWeekRange(): { from: Date; to: Date } {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const monday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + mondayOffset,
    0, 0, 0, 0
  ));
  
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  
  return { from: monday, to: sunday };
}

/**
 * Get the start and end of the current month (1st 00:00 UTC → last day 23:59 UTC)
 */
function getCurrentMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  
  const firstDay = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    1, 0, 0, 0, 0
  ));
  
  const lastDay = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    0, 23, 59, 59, 999
  ));
  
  return { from: firstDay, to: lastDay };
}

/**
 * Get date range based on period or custom dates
 */
function getDateRange(
  period: Period,
  fromParam?: string,
  toParam?: string
): { from: Date; to: Date } {
  // Custom date range overrides period
  if (fromParam && toParam) {
    return {
      from: new Date(fromParam),
      to: new Date(toParam),
    };
  }
  
  switch (period) {
    case 'week':
      return getCurrentWeekRange();
    case 'month':
      return getCurrentMonthRange();
    case 'all':
    default:
      return {
        from: new Date('2020-01-01T00:00:00Z'),
        to: new Date('2100-01-01T00:00:00Z'),
      };
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LeaderboardResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  // Verify admin token
  const adminToken = req.headers['x-admin-token'];
  if (adminToken !== process.env.ADMIN_PANEL_TOKEN) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    // Parse query params
    const metric = (req.query.metric as Metric) || 'myst_spent';
    const period = (req.query.period as Period) || 'week';
    const limit = Math.min(
      Math.max(1, parseInt(req.query.limit as string) || 10),
      100
    );
    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;

    // Validate metric
    if (!['myst_spent', 'referrals', 'axp'].includes(metric)) {
      return res.status(400).json({ ok: false, message: 'Invalid metric' });
    }

    // Get date range
    const dateRange = getDateRange(period, fromParam, toParam);
    
    let rows: LeaderboardRow[] = [];
    let total = 0;

    if (metric === 'myst_spent') {
      // Aggregate MYST spent from transactions
      // Spend types: bet, campaign_fee, boost (negative amounts)
      const spendData = await prisma.mystTransaction.groupBy({
        by: ['userId'],
        where: {
          type: { in: ['bet', 'campaign_fee', 'boost'] },
          amount: { lt: 0 },
          createdAt: {
            gte: dateRange.from,
            lte: dateRange.to,
          },
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'asc' } }, // Most negative = most spent
        take: limit,
      });

      // Calculate total
      const totalResult = await prisma.mystTransaction.aggregate({
        where: {
          type: { in: ['bet', 'campaign_fee', 'boost'] },
          amount: { lt: 0 },
          createdAt: {
            gte: dateRange.from,
            lte: dateRange.to,
          },
        },
        _sum: { amount: true },
      });
      total = Math.abs(totalResult._sum.amount ?? 0);

      // Fetch user details for each
      for (const row of spendData) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: row.userId },
            select: {
              id: true,
              telegramId: true,
              username: true,
              firstName: true,
              points: true,
            },
          });

          if (!user) continue;

          const mystBalance = await getMystBalance(prisma, user.id);

          rows.push({
            userId: user.id,
            telegramId: user.telegramId,
            username: user.username,
            firstName: user.firstName,
            mystValue: Math.abs(row._sum.amount ?? 0),
            referralCount: 0,
            axpValue: user.points,
            mystBalance,
          });
        } catch (e: any) {
          console.error(`[AdminLeaderboard] Error fetching user ${row.userId}:`, e.message);
        }
      }

    } else if (metric === 'referrals') {
      // Count referrals created within the period
      // Group by referrerId and count users
      const referralData = await prisma.user.groupBy({
        by: ['referrerId'],
        where: {
          referrerId: { not: null },
          createdAt: {
            gte: dateRange.from,
            lte: dateRange.to,
          },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit,
      });

      // Calculate total
      const totalReferrals = await prisma.user.count({
        where: {
          referrerId: { not: null },
          createdAt: {
            gte: dateRange.from,
            lte: dateRange.to,
          },
        },
      });
      total = totalReferrals;

      // Fetch user details for each referrer
      for (const row of referralData) {
        if (!row.referrerId) continue;

        try {
          const user = await prisma.user.findUnique({
            where: { id: row.referrerId },
            select: {
              id: true,
              telegramId: true,
              username: true,
              firstName: true,
              points: true,
            },
          });

          if (!user) continue;

          const mystBalance = await getMystBalance(prisma, user.id);

          rows.push({
            userId: user.id,
            telegramId: user.telegramId,
            username: user.username,
            firstName: user.firstName,
            mystValue: 0,
            referralCount: row._count.id,
            axpValue: user.points,
            mystBalance,
          });
        } catch (e: any) {
          console.error(`[AdminLeaderboard] Error fetching referrer ${row.referrerId}:`, e.message);
        }
      }

    } else if (metric === 'axp') {
      // aXP is all-time points on User model
      // We don't have time-based aXP tracking, so return all-time values
      const users = await prisma.user.findMany({
        orderBy: { points: 'desc' },
        take: limit,
        select: {
          id: true,
          telegramId: true,
          username: true,
          firstName: true,
          points: true,
        },
      });

      // Calculate total points
      const totalPoints = await prisma.user.aggregate({
        _sum: { points: true },
      });
      total = totalPoints._sum.points ?? 0;

      for (const user of users) {
        try {
          const mystBalance = await getMystBalance(prisma, user.id);

          rows.push({
            userId: user.id,
            telegramId: user.telegramId,
            username: user.username,
            firstName: user.firstName,
            mystValue: 0,
            referralCount: 0,
            axpValue: user.points,
            mystBalance,
          });
        } catch (e: any) {
          console.error(`[AdminLeaderboard] Error fetching user ${user.id}:`, e.message);
        }
      }
    }

    return res.status(200).json({
      ok: true,
      metric,
      period: {
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString(),
      },
      rows,
      total,
    });

  } catch (error: any) {
    console.error('[AdminLeaderboard] Error:', error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

