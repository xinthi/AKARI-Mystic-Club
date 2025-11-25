import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';

type LeaderboardEntry = {
  rank: number;
  userId: string;
  username?: string;
  tier?: string;
  points: number;
  credibilityScore?: number;
  positiveReviews?: number;
  completions?: number;
};

type Data = {
  ok: boolean;
  leaderboard: LeaderboardEntry[];
  reason?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  try {
    const { type = 'points' } = req.query;

    // Base query based on type
    let whereClause: { tier?: { not: null }; points?: { gt: number } } = {};
    
    if (type === 'tier') {
      // For tier leaderboard, filter users who have a tier
      whereClause = { tier: { not: null } };
    }

    const users = await prisma.user.findMany({
      where: whereClause,
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

    // Filter out users with 0 points if there are any with points
    const usersWithPoints = users.filter((u) => u.points > 0);
    const finalUsers = usersWithPoints.length > 0 ? usersWithPoints : [];

    const leaderboard: LeaderboardEntry[] = finalUsers.map((u, idx) => ({
      rank: idx + 1,
      userId: u.id,
      username: u.username ?? 'Anonymous',
      tier: u.tier ?? undefined,
      points: u.points,
      credibilityScore: u.credibilityScore ?? undefined,
      positiveReviews: u.positiveReviews,
      completions: u._count.campaignsProgress,
    }));

    res.status(200).json({ ok: true, leaderboard });
  } catch (e: any) {
    console.error('Leaderboard API error:', e);
    res.status(500).json({ ok: false, leaderboard: [], reason: 'Server error' });
  }
}
