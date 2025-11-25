/**
 * Leaderboard API
 * 
 * GET: Get leaderboard by points, tier, or campaign
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const type = (req.query.type as string) || 'points'; // points, tier, campaign
    const tier = req.query.tier as string | undefined;
    const campaignId = req.query.campaignId as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    if (type === 'campaign' && campaignId) {
      // Campaign-specific leaderboard
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { leaderboard: true, completions: true }
      });

      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      // Calculate leaderboard from completions
      const completions = (campaign.completions as any[]) || [];
      const userCompletions: Record<string, number> = {};

      for (const completion of completions) {
        const userId = completion.userId;
        userCompletions[userId] = (userCompletions[userId] || 0) + 1;
      }

      // Get top users
      const topUserIds = Object.entries(userCompletions)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([userId]) => userId);

      const users = await prisma.user.findMany({
        where: { id: { in: topUserIds } },
        select: {
          id: true,
          username: true,
          tier: true,
          points: true,
          credibilityScore: true
        }
      });

      const leaderboard = users.map(user => ({
        userId: user.id,
        username: user.username,
        tier: user.tier,
        points: user.points,
        credibilityScore: user.credibilityScore,
        completions: userCompletions[user.id] || 0
      })).sort((a, b) => b.completions - a.completions);

      return res.status(200).json({
        type: 'campaign',
        campaignId,
        leaderboard
      });
    }

    if (type === 'tier' && tier) {
      // Tier-specific leaderboard
      const users = await prisma.user.findMany({
        where: {
          tier: {
            startsWith: tier
          }
        },
        select: {
          id: true,
          username: true,
          tier: true,
          points: true,
          credibilityScore: true,
          positiveReviews: true
        },
        orderBy: [
          { points: 'desc' },
          { credibilityScore: 'desc' }
        ],
        take: limit
      });

      return res.status(200).json({
        type: 'tier',
        tier,
        leaderboard: users.map((user, index) => ({
          rank: index + 1,
          userId: user.id,
          username: user.username,
          tier: user.tier,
          points: user.points,
          credibilityScore: user.credibilityScore,
          positiveReviews: user.positiveReviews
        }))
      });
    }

    // Default: Overall points leaderboard
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        tier: true,
        points: true,
        credibilityScore: true,
        positiveReviews: true
      },
      orderBy: [
        { points: 'desc' },
        { credibilityScore: 'desc' }
      ],
      take: limit
    });

    return res.status(200).json({
      type: 'points',
      leaderboard: users.map((user, index) => ({
        rank: index + 1,
        userId: user.id,
        username: user.username,
        tier: user.tier,
        points: user.points,
        credibilityScore: user.credibilityScore,
        positiveReviews: user.positiveReviews
      }))
    });
  } catch (error: any) {
    console.error('Leaderboard API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
}

