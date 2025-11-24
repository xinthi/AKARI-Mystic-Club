import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {

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
