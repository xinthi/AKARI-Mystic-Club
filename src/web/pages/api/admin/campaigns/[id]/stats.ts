/**
 * Per-Campaign Stats API
 * 
 * GET /api/admin/campaigns/[id]/stats
 * 
 * Returns detailed statistics for a single campaign
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../../lib/prisma';

interface CampaignStats {
  id: string;
  title: string;
  status: string;
  totalParticipants: number;
  totalTaskCompletions: number;
  completionRate: number; // percentage
  taskBreakdown: {
    taskId: string;
    title: string;
    type: string;
    completions: number;
    uniqueUsers: number;
  }[];
  recentParticipants: {
    id: string;
    username: string | null;
    tasksCompleted: number;
    joinedAt: string;
  }[];
  totalReferrals: number;
  avgTasksPerUser: number;
  daysActive: number;
}

interface StatsResponse {
  ok: boolean;
  stats?: CampaignStats;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatsResponse>
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

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, message: 'Invalid campaign ID' });
  }

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        tasks: true,
        referrals: true,
      },
    });

    if (!campaign) {
      return res.status(404).json({ ok: false, message: 'Campaign not found' });
    }

    // Get all progress entries for this campaign
    const allProgress = await prisma.campaignUserProgress.findMany({
      where: { campaignId: id },
      include: {
        user: {
          select: { id: true, username: true, firstName: true },
        },
      },
      orderBy: { completedAt: 'desc' },
    });

    // Unique participants (users who have at least one progress entry)
    const participantIds = new Set(allProgress.map(p => p.userId));
    const totalParticipants = participantIds.size;

    // Total task completions
    const completedProgress = allProgress.filter(p => p.completedAt);
    const totalTaskCompletions = completedProgress.length;

    // Completion rate (tasks completed / total possible tasks for all participants)
    const totalPossibleTasks = totalParticipants * campaign.tasks.length;
    const completionRate = totalPossibleTasks > 0
      ? (totalTaskCompletions / totalPossibleTasks) * 100
      : 0;

    // Task breakdown
    const taskBreakdown = campaign.tasks.map(task => {
      const taskProgress = completedProgress.filter(p => p.taskId === task.id);
      const uniqueUserIds = new Set(taskProgress.map(p => p.userId));
      return {
        taskId: task.id,
        title: task.title,
        type: task.type,
        completions: taskProgress.length,
        uniqueUsers: uniqueUserIds.size,
      };
    });

    // Recent participants (users who joined recently)
    const userTaskCounts: Record<string, { username: string | null; count: number; firstJoin: Date }> = {};
    for (const p of allProgress) {
      if (!userTaskCounts[p.userId]) {
        userTaskCounts[p.userId] = {
          username: p.user.username || p.user.firstName || null,
          count: 0,
          firstJoin: p.createdAt,
        };
      }
      if (p.completedAt) {
        userTaskCounts[p.userId].count++;
      }
      if (p.createdAt < userTaskCounts[p.userId].firstJoin) {
        userTaskCounts[p.userId].firstJoin = p.createdAt;
      }
    }

    const recentParticipants = Object.entries(userTaskCounts)
      .map(([id, data]) => ({
        id,
        username: data.username,
        tasksCompleted: data.count,
        joinedAt: data.firstJoin.toISOString(),
      }))
      .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())
      .slice(0, 10);

    // Total referrals for this campaign
    const totalReferrals = campaign.referrals.length;

    // Avg tasks per user
    const avgTasksPerUser = totalParticipants > 0
      ? totalTaskCompletions / totalParticipants
      : 0;

    // Days active
    const daysActive = Math.ceil(
      (new Date().getTime() - new Date(campaign.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    return res.status(200).json({
      ok: true,
      stats: {
        id: campaign.id,
        title: (campaign as any).title || campaign.name,
        status: (campaign as any).status || 'ACTIVE',
        totalParticipants,
        totalTaskCompletions,
        completionRate,
        taskBreakdown,
        recentParticipants,
        totalReferrals,
        avgTasksPerUser,
        daysActive,
      },
    });
  } catch (error: any) {
    console.error('[Admin/Campaign/Stats] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

