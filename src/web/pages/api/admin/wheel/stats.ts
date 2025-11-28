/**
 * Admin Wheel Stats API
 * 
 * GET /api/admin/wheel/stats
 * 
 * Returns wheel pool statistics for admin dashboard.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { getWheelPoolBalance } from '../../../../lib/myst-service';

interface StatsResponse {
  ok: boolean;
  poolBalance?: number;
  totalSpins?: number;
  totalWon?: number;
  recentSpins?: Array<{
    id: string;
    username?: string;
    prizeType: string;
    mystWon: number;
    axpWon: number;
    createdAt: string;
  }>;
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
  const adminToken = req.headers['x-admin-token'];
  if (adminToken !== process.env.ADMIN_PANEL_TOKEN) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    // Get pool balance
    const poolBalance = await getWheelPoolBalance(prisma);

    // Get total spins count
    const totalSpins = await prisma.wheelSpin.count();

    // Get total MYST won
    const totalWonResult = await prisma.wheelSpin.aggregate({
      _sum: { mystWon: true },
    });
    const totalWon = totalWonResult._sum.mystWon ?? 0;

    // Get recent spins with user info
    const recentSpins = await prisma.wheelSpin.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { username: true, firstName: true },
        },
      },
    });

    return res.status(200).json({
      ok: true,
      poolBalance,
      totalSpins,
      totalWon,
      recentSpins: recentSpins.map((spin) => ({
        id: spin.id,
        username: spin.user.username || spin.user.firstName || 'Anonymous',
        prizeType: spin.prizeType,
        mystWon: spin.mystWon,
        axpWon: spin.axpWon,
        createdAt: spin.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Admin] wheel/stats failed:', message);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}
