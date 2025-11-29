/**
 * Admin Campaign Participants API
 * 
 * GET /api/admin/campaigns/[id]/participants - Get all participants with their scores
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../../lib/prisma';

interface Participant {
  userId: string;
  username?: string;
  firstName?: string;
  telegramId: string;
  tasksCompleted: number;
  totalPoints: number;
  referralCount: number;
  referralBonus: number;
  totalScore: number;
  completedAt?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify admin token
  const adminToken = process.env.ADMIN_PANEL_TOKEN;
  if (!adminToken) {
    return res.status(500).json({ ok: false, message: 'Admin panel not configured' });
  }

  const providedToken = req.headers['x-admin-token'] as string | undefined;
  if (!providedToken || providedToken !== adminToken) {
    return res.status(403).json({ ok: false, message: 'Forbidden' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, message: 'Invalid campaign ID' });
  }

  try {
    if (req.method === 'GET') {
      // Get campaign details
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          referralBonus: true,
          winnerCount: true,
          winnersSelected: true,
          tasks: {
            select: { id: true, rewardPoints: true },
          },
        },
      });

      if (!campaign) {
        return res.status(404).json({ ok: false, message: 'Campaign not found' });
      }

      // Get all task completions for this campaign
      const progress = await prisma.campaignUserProgress.findMany({
        where: {
          campaignId: id,
          completed: true,
        },
        include: {
          user: {
            select: {
              id: true,
              telegramId: true,
              username: true,
              firstName: true,
            },
          },
          task: {
            select: {
              id: true,
              rewardPoints: true,
            },
          },
        },
      });

      // Get referral counts per user for this campaign
      const referrals = await prisma.campaignReferral.groupBy({
        by: ['referrerId'],
        where: { campaignId: id },
        _count: { referredId: true },
      });

      const referralCounts = new Map<string, number>();
      referrals.forEach((r) => {
        referralCounts.set(r.referrerId, r._count.referredId);
      });

      // Aggregate by user
      const userScores = new Map<string, Participant>();

      for (const p of progress) {
        const userId = p.userId;
        const existing = userScores.get(userId);

        if (existing) {
          existing.tasksCompleted += 1;
          existing.totalPoints += p.task.rewardPoints || 0;
          if (p.completedAt && (!existing.completedAt || new Date(p.completedAt) > new Date(existing.completedAt))) {
            existing.completedAt = p.completedAt?.toISOString();
          }
        } else {
          const referralCount = referralCounts.get(userId) || 0;
          const referralBonus = referralCount * (campaign.referralBonus || 5);

          userScores.set(userId, {
            userId,
            username: p.user.username || undefined,
            firstName: p.user.firstName || undefined,
            telegramId: p.user.telegramId,
            tasksCompleted: 1,
            totalPoints: p.task.rewardPoints || 0,
            referralCount,
            referralBonus,
            totalScore: 0, // Will calculate after
            completedAt: p.completedAt?.toISOString(),
          });
        }
      }

      // Calculate total scores (points + referral bonus)
      const participants: Participant[] = [];
      userScores.forEach((p) => {
        p.totalScore = p.totalPoints + p.referralBonus;
        participants.push(p);
      });

      // Sort by total score descending
      participants.sort((a, b) => b.totalScore - a.totalScore);

      // Get existing winners if any
      const existingWinners = await prisma.campaignWinner.findMany({
        where: { campaignId: id },
        select: { userId: true, rank: true },
      });

      const winnerMap = new Map<string, number>();
      existingWinners.forEach((w) => {
        winnerMap.set(w.userId, w.rank);
      });

      return res.status(200).json({
        ok: true,
        campaign: {
          id: campaign.id,
          name: campaign.name,
          winnerCount: campaign.winnerCount || 25,
          winnersSelected: campaign.winnersSelected || false,
          totalTasks: campaign.tasks.length,
          referralBonus: campaign.referralBonus || 5,
        },
        participants: participants.map((p, idx) => ({
          ...p,
          rank: idx + 1,
          isWinner: winnerMap.has(p.userId),
          winnerRank: winnerMap.get(p.userId),
        })),
        totalParticipants: participants.length,
      });
    }

    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  } catch (error: any) {
    console.error('[Admin/CampaignParticipants] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

