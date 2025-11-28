/**
 * Wheel of Fortune Status API
 * 
 * GET /api/wheel/status
 * 
 * Returns wheel status: pool balance, spins remaining, prizes.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { 
  MYST_CONFIG, 
  WHEEL_PRIZES,
  getWheelPoolBalance,
  getUserSpinsToday,
} from '../../../lib/myst-service';

interface StatusResponse {
  ok: boolean;
  spinsRemaining: number;
  maxSpinsPerDay: number;
  poolBalance: number;
  nextResetAt: string;
  prizes: Array<{
    type: string;
    label: string;
    myst: number;
    axp: number;
  }>;
  poolEmpty: boolean;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatusResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      spinsRemaining: 0,
      maxSpinsPerDay: MYST_CONFIG.WHEEL_SPINS_PER_DAY,
      poolBalance: 0,
      nextResetAt: '',
      prizes: [],
      poolEmpty: true,
      message: 'Method not allowed',
    });
  }

  try {
    // Authenticate user (optional for status)
    const user = await getUserFromRequest(req, prisma);
    
    // Get pool balance
    const poolBalance = await getWheelPoolBalance(prisma);

    // Calculate next reset time (midnight UTC)
    const now = new Date();
    const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

    // Get spins remaining if user is authenticated
    let spinsRemaining: number = MYST_CONFIG.WHEEL_SPINS_PER_DAY;
    if (user) {
      const spinsToday = await getUserSpinsToday(prisma, user.id);
      spinsRemaining = Math.max(0, MYST_CONFIG.WHEEL_SPINS_PER_DAY - spinsToday);
    }

    // Check if pool is effectively empty (can't pay smallest MYST prize)
    const smallestMystPrize = WHEEL_PRIZES
      .filter(p => p.type === 'myst' && p.myst > 0)
      .sort((a, b) => a.myst - b.myst)[0];
    const poolEmpty = smallestMystPrize ? poolBalance < smallestMystPrize.myst : poolBalance <= 0;

    return res.status(200).json({
      ok: true,
      spinsRemaining,
      maxSpinsPerDay: MYST_CONFIG.WHEEL_SPINS_PER_DAY,
      poolBalance,
      nextResetAt: nextReset.toISOString(),
      prizes: WHEEL_PRIZES.map(p => ({
        type: p.type,
        label: p.label,
        myst: p.myst,
        axp: p.axp,
      })),
      poolEmpty,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Wheel] status failed:', message);
    return res.status(500).json({
      ok: false,
      spinsRemaining: 0,
      maxSpinsPerDay: MYST_CONFIG.WHEEL_SPINS_PER_DAY,
      poolBalance: 0,
      nextResetAt: '',
      prizes: [],
      poolEmpty: true,
      message: 'Failed to get wheel status',
    });
  }
}
