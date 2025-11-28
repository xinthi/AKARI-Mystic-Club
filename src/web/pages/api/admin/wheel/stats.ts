/**
 * Admin Wheel Stats API
 * 
 * GET /api/admin/wheel/stats
 * 
 * Returns wheel pool statistics for admin dashboard.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { getWheelPool } from '../../../../lib/myst-service';

interface StatsResponse {
  ok: boolean;
  poolBalance?: number;
  totalSpins?: number;
  totalWon?: number;
  recentSpins?: Array<{
    id: string;
    username?: string;
    amountWon: number;
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
    const pool = await getWheelPool(prisma);

    // Get total spins count
    const totalSpins = await prisma.wheelSpin.count();

    // Get total won
    const totalWonResult = await prisma.wheelSpin.aggregate({
      _sum: { amountWon: true },
    });
    const totalWon = totalWonResult._sum.amountWon ?? 0;

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
      poolBalance: pool.balance,
      totalSpins,
      totalWon,
      recentSpins: recentSpins.map((spin) => ({
        id: spin.id,
        username: spin.user.username || spin.user.firstName || 'Anonymous',
        amountWon: spin.amountWon,
        createdAt: spin.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error('[/api/admin/wheel/stats] Error:', error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

