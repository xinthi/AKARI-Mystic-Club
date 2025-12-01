/**
 * Per-Prediction Stats API
 * 
 * GET /api/admin/predictions/[id]/stats
 * 
 * Returns detailed statistics for a single prediction
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../../lib/prisma';

interface PredictionStats {
  id: string;
  title: string;
  status: string;
  totalPool: number;
  yesPool: number;
  noPool: number;
  totalBets: number;
  uniqueBettors: number;
  avgBetSize: number;
  largestBet: number;
  betsByOption: { option: string; count: number; total: number }[];
  recentBets: {
    id: string;
    username: string | null;
    option: string;
    amount: number;
    createdAt: string;
  }[];
}

interface StatsResponse {
  ok: boolean;
  stats?: PredictionStats;
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
    return res.status(400).json({ ok: false, message: 'Invalid prediction ID' });
  }

  try {
    const prediction = await prisma.prediction.findUnique({
      where: { id },
      include: {
        bets: {
          include: {
            user: {
              select: { username: true, firstName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!prediction) {
      return res.status(404).json({ ok: false, message: 'Prediction not found' });
    }

    // Calculate stats
    const yesPool = prediction.mystPoolYes || 0;
    const noPool = prediction.mystPoolNo || 0;
    const totalPool = yesPool + noPool;
    const totalBets = prediction.bets.length;
    
    const uniqueBettorIds = new Set(prediction.bets.map(b => b.userId));
    const uniqueBettors = uniqueBettorIds.size;
    
    const betAmounts = prediction.bets.map(b => b.mystBet || 0).filter(a => a > 0);
    const avgBetSize = betAmounts.length > 0 
      ? betAmounts.reduce((a, b) => a + b, 0) / betAmounts.length 
      : 0;
    const largestBet = betAmounts.length > 0 ? Math.max(...betAmounts) : 0;

    // Bets by option
    const betsByOption = prediction.options.map(option => {
      const optionBets = prediction.bets.filter(b => b.option === option);
      return {
        option,
        count: optionBets.length,
        total: optionBets.reduce((sum, b) => sum + (b.mystBet || 0), 0),
      };
    });

    // Recent bets (last 10)
    const recentBets = prediction.bets.slice(0, 10).map(bet => ({
      id: bet.id,
      username: bet.user.username || bet.user.firstName || null,
      option: bet.option,
      amount: bet.mystBet || 0,
      createdAt: bet.createdAt.toISOString(),
    }));

    return res.status(200).json({
      ok: true,
      stats: {
        id: prediction.id,
        title: prediction.title,
        status: (prediction as any).status || 'ACTIVE',
        totalPool,
        yesPool,
        noPool,
        totalBets,
        uniqueBettors,
        avgBetSize,
        largestBet,
        betsByOption,
        recentBets,
      },
    });
  } catch (error: any) {
    console.error('[Admin/Prediction/Stats] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

