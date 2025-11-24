import type { NextApiRequest, NextApiResponse } from 'next';

let prisma: any = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;

    if (!prisma) {
      const prismaModule = await import('../../../../bot/src/utils/prisma.js');
      prisma = prismaModule.prisma;
    }

    // Try to find by ID first, then by telegramId
    let user = await prisma.user.findUnique({
      where: { id: userId as string },
      include: {
        reviewsReceived: true,
        createdCampaigns: {
          where: { isActive: true },
          take: 5
        }
      }
    });

    // If not found by ID, try telegramId
    if (!user && /^\d+$/.test(userId as string)) {
      user = await prisma.user.findUnique({
        where: { telegramId: BigInt(userId as string) },
        include: {
          reviewsReceived: true,
          createdCampaigns: {
            where: { isActive: true },
            take: 5
          }
        }
      });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get tier config
    const tierConfig = user.tier ? await prisma.tier.findFirst({
      where: {
        name: user.tier.split('_')[0],
        level: parseInt(user.tier.split('_L')[1] || '1', 10)
      }
    }) : null;

    res.json({
      user: {
        id: user.id,
        username: user.username,
        points: user.points,
        tier: user.tier,
        tierConfig,
        credibilityScore: user.credibilityScore || 0,
        positiveReviews: user.positiveReviews,
        interests: user.interests,
        joinedAt: user.joinedAt,
        lastActive: user.lastActive
      }
    });
  } catch (error: any) {
    console.error('Profile API error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

