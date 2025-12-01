/**
 * Admin Campaign Winner Selection API
 * 
 * POST /api/admin/campaigns/[id]/select-winners - Select winners for a campaign
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../../lib/prisma';

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

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    // Get campaign details
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        referralBonus: true,
        winnerCount: true,
        winnersSelected: true,
        selectionRuns: true,
        endsAt: true,
        tasks: {
          select: { id: true, rewardPoints: true },
        },
      },
    });

    if (!campaign) {
      return res.status(404).json({ ok: false, message: 'Campaign not found' });
    }

    // Check if campaign has ended
    const now = new Date();
    if (campaign.endsAt > now) {
      return res.status(400).json({ 
        ok: false, 
        message: `Cannot select winners before campaign ends. Campaign ends on ${campaign.endsAt.toLocaleDateString()} at ${campaign.endsAt.toLocaleTimeString()}.` 
      });
    }

    // Get all completed task progress
    const progress = await prisma.campaignUserProgress.findMany({
      where: {
        campaignId: id,
        completed: true,
      },
      include: {
        user: { select: { id: true } },
        task: { select: { rewardPoints: true } },
      },
    });

    // Get referral counts
    const referrals = await prisma.campaignReferral.groupBy({
      by: ['referrerId'],
      where: { campaignId: id },
      _count: { referredId: true },
    });

    const referralCounts = new Map<string, number>();
    referrals.forEach((r) => {
      referralCounts.set(r.referrerId, r._count.referredId);
    });

    // Aggregate scores by user
    const userScores = new Map<string, {
      userId: string;
      tasksCompleted: number;
      totalPoints: number;
      referralCount: number;
      totalScore: number;
    }>();

    for (const p of progress) {
      const userId = p.userId;
      const existing = userScores.get(userId);

      if (existing) {
        existing.tasksCompleted += 1;
        existing.totalPoints += p.task.rewardPoints || 0;
      } else {
        const referralCount = referralCounts.get(userId) || 0;
        const referralBonus = referralCount * (campaign.referralBonus || 5);

        userScores.set(userId, {
          userId,
          tasksCompleted: 1,
          totalPoints: p.task.rewardPoints || 0,
          referralCount,
          totalScore: 0, // Will calculate
        });
      }
    }

    // Calculate total scores and sort
    const participants = Array.from(userScores.values());
    participants.forEach((p) => {
      const referralBonus = p.referralCount * (campaign.referralBonus || 5);
      p.totalScore = p.totalPoints + referralBonus;
    });

    // Sort by total score, then by tasks completed, then by referrals
    participants.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.tasksCompleted !== a.tasksCompleted) return b.tasksCompleted - a.tasksCompleted;
      return b.referralCount - a.referralCount;
    });

    // Get winner count from request body or use campaign default
    const { winnerCount: requestedWinnerCount } = req.body || {};
    const winnerCount = requestedWinnerCount || campaign.winnerCount || 25;
    
    // Validate winner count (must be 25, 50, or 100)
    const validWinnerCounts = [25, 50, 100];
    const finalWinnerCount = validWinnerCounts.includes(winnerCount) ? winnerCount : 25;
    
    const winners = participants.slice(0, finalWinnerCount);

    if (winners.length === 0) {
      return res.status(400).json({ ok: false, message: 'No participants to select as winners' });
    }

    // Calculate the new run number
    const newRunNumber = (campaign.selectionRuns || 0) + 1;

    // Insert winners with run number (don't delete old runs)
    const winnerData = winners.map((w, idx) => ({
      campaignId: id,
      userId: w.userId,
      rank: idx + 1,
      totalPoints: w.totalScore,
      tasksCompleted: w.tasksCompleted,
      referralCount: w.referralCount,
      selectionRun: newRunNumber,
    }));

    await prisma.campaignWinner.createMany({ data: winnerData });

    // Mark campaign as winners selected, update winner count and run number
    await prisma.campaign.update({
      where: { id },
      data: { 
        winnersSelected: true,
        winnerCount: finalWinnerCount,
        selectionRuns: newRunNumber,
      },
    });

    console.log(`[Admin/SelectWinners] Run ${newRunNumber}: Selected ${winners.length} winners for campaign ${id}`);

    return res.status(200).json({
      ok: true,
      message: `Run ${newRunNumber}: Selected ${winners.length} winners`,
      winnersCount: winners.length,
      runNumber: newRunNumber,
      topWinner: winners[0] ? {
        userId: winners[0].userId,
        score: winners[0].totalScore,
        tasksCompleted: winners[0].tasksCompleted,
        referralCount: winners[0].referralCount,
      } : null,
    });
  } catch (error: any) {
    console.error('[Admin/SelectWinners] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

