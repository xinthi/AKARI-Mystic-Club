import type { NextApiRequest, NextApiResponse } from 'next';

let prisma: any = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!prisma) {
      const prismaModule = await import('../../../bot/src/utils/prisma.js');
      prisma = prismaModule.prisma;
    }

    const campaigns = await prisma.campaign.findMany({
      where: {
        isActive: true,
        endsAt: { gte: new Date() }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    res.json({ campaigns });
  } catch (error: any) {
    console.error('Campaigns API error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
