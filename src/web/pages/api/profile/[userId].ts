import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getTierConfig } from '../../../lib/tiers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;

    // Try to find by ID first, then by telegramId
    let user = await prisma.user.findUnique({
      where: { id: userId as string },
    });

    // If not found by ID, try telegramId
    if (!user && /^\d+$/.test(userId as string)) {
      user = await prisma.user.findUnique({
        where: { telegramId: userId as string },
      });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get tier config from static configuration
    const tierConfig = getTierConfig(user.tier);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        points: user.points,
        tier: user.tier,
        tierConfig,
        credibilityScore: user.credibilityScore || 0,
        positiveReviews: user.positiveReviews,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('Profile API error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
