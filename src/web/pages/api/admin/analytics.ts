/**
 * Admin Analytics API
 * 
 * GET /api/admin/analytics
 * 
 * Returns platform-wide statistics:
 * - Total users
 * - MAU (Monthly Active Users)
 * - DAU (Daily Active Users)
 * - Total MYST spent
 * - Total predictions
 * - Total campaigns
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../lib/prisma';

interface AnalyticsResponse {
  ok: boolean;
  stats?: {
    totalUsers: number;
    newUsersToday: number;
    newUsersWeek: number;
    newUsersMonth: number;
    dau: number; // Daily Active Users
    wau: number; // Weekly Active Users
    mau: number; // Monthly Active Users
    totalMystSpent: number;
    totalMystInCirculation: number;
    totalPredictions: number;
    activePredictions: number;
    totalBets: number;
    totalCampaigns: number;
    activeCampaigns: number;
    totalTasksCompleted: number;
    totalReferrals: number;
    totalWheelSpins: number;
    totalDeposits: number;
    pendingDeposits: number;
    totalWithdrawals: number;
    pendingWithdrawals: number;
  };
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnalyticsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  // Verify admin token
  const adminToken = process.env.ADMIN_PANEL_TOKEN;
  if (!adminToken) {
    return res.status(500).json({ ok: false, message: 'Admin panel not configured' });
  }

  const providedToken = req.headers['x-admin-token'] as string | undefined;
  if (!providedToken || providedToken !== adminToken) {
    return res.status(403).json({ ok: false, message: 'Forbidden' });
  }

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Run all queries in parallel with retry
    const [
      totalUsers,
      newUsersToday,
      newUsersWeek,
      newUsersMonth,
      dauCount,
      wauCount,
      mauCount,
      mystSpentResult,
      mystCirculationResult,
      totalPredictions,
      activePredictions,
      totalBets,
      totalCampaigns,
      activeCampaigns,
      totalTasksCompleted,
      totalReferrals,
      totalWheelSpins,
      totalDeposits,
      pendingDeposits,
      totalWithdrawals,
      pendingWithdrawals,
    ] = await withDbRetry(() => Promise.all([
      // Total users
      prisma.user.count(),
      
      // New users today
      prisma.user.count({
        where: { createdAt: { gte: todayStart } },
      }),
      
      // New users this week
      prisma.user.count({
        where: { createdAt: { gte: weekAgo } },
      }),
      
      // New users this month
      prisma.user.count({
        where: { createdAt: { gte: monthAgo } },
      }),
      
      // DAU - users with activity today
      prisma.user.count({
        where: { updatedAt: { gte: todayStart } },
      }),
      
      // WAU - users with activity this week
      prisma.user.count({
        where: { updatedAt: { gte: weekAgo } },
      }),
      
      // MAU - users with activity this month
      prisma.user.count({
        where: { updatedAt: { gte: monthAgo } },
      }),
      
      // Total MYST spent (sum of negative transactions excluding system)
      prisma.mystTransaction.aggregate({
        _sum: { amount: true },
        where: {
          amount: { lt: 0 },
          type: { notIn: ['withdraw_burn', 'pool_leaderboard', 'pool_referral', 'pool_wheel', 'platform_treasury'] },
        },
      }),
      
      // Total MYST in circulation (sum of all positive non-system transactions)
      prisma.mystTransaction.aggregate({
        _sum: { amount: true },
        where: {
          amount: { gt: 0 },
          type: { in: ['admin_grant', 'onboarding_bonus', 'referral_milestone', 'deposit_credit', 'wheel_prize', 'bet_win'] },
        },
      }),
      
      // Total predictions
      prisma.prediction.count(),
      
      // Active predictions
      prisma.prediction.count({
        where: { status: 'ACTIVE' },
      }),
      
      // Total bets
      prisma.bet.count(),
      
      // Total campaigns
      prisma.campaign.count(),
      
      // Active campaigns
      prisma.campaign.count({
        where: { status: 'ACTIVE' },
      }),
      
      // Total tasks completed
      prisma.campaignUserProgress.count({
        where: { completedAt: { not: null } },
      }),
      
      // Total referrals
      prisma.user.count({
        where: { referrerId: { not: null } },
      }),
      
      // Total wheel spins
      prisma.wheelSpin.count(),
      
      // Total deposits
      prisma.deposit.count(),
      
      // Pending deposits
      prisma.deposit.count({
        where: { status: 'pending' },
      }),
      
      // Total withdrawals
      prisma.withdrawalRequest.count(),
      
      // Pending withdrawals
      prisma.withdrawalRequest.count({
        where: { status: 'pending' },
      }),
    ]));

    return res.status(200).json({
      ok: true,
      stats: {
        totalUsers,
        newUsersToday,
        newUsersWeek,
        newUsersMonth,
        dau: dauCount,
        wau: wauCount,
        mau: mauCount,
        totalMystSpent: Math.abs(mystSpentResult._sum.amount || 0),
        totalMystInCirculation: mystCirculationResult._sum.amount || 0,
        totalPredictions,
        activePredictions,
        totalBets,
        totalCampaigns,
        activeCampaigns,
        totalTasksCompleted,
        totalReferrals,
        totalWheelSpins,
        totalDeposits,
        pendingDeposits,
        totalWithdrawals,
        pendingWithdrawals,
      },
    });
  } catch (error: any) {
    console.error('[Admin/Analytics] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

