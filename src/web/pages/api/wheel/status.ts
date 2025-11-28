/**
 * Wheel of Fortune Status API
 * 
 * GET /api/wheel/status
 * 
 * Returns wheel status: pool balance, whether user can spin, next spin time.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { MYST_CONFIG, getWheelPool } from '../../../lib/myst-service';

interface StatusResponse {
  ok: boolean;
  hasSpunToday: boolean;
  poolBalance: number;
  nextSpinAt: string;
  prizes: readonly number[];
  message?: string;
}

/**
 * Get start of current UTC day.
 */
function getUTCDayStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatusResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      hasSpunToday: false,
      poolBalance: 0,
      nextSpinAt: '',
      prizes: MYST_CONFIG.WHEEL_PRIZES,
      message: 'Method not allowed',
    });
  }

  try {
    // Authenticate user (optional - can view status without auth)
    const user = await getUserFromRequest(req, prisma);
    
    // Get wheel pool balance
    const pool = await getWheelPool(prisma);

    // Calculate next spin time
    const dayStart = getUTCDayStart();
    const nextDayStart = new Date(dayStart);
    nextDayStart.setUTCDate(nextDayStart.getUTCDate() + 1);

    // Check if user has spun today
    let hasSpunToday = false;
    
    if (user) {
      const existingSpin = await prisma.wheelSpin.findFirst({
        where: {
          userId: user.id,
          createdAt: { gte: dayStart },
        },
      });
      hasSpunToday = !!existingSpin;
    }

    return res.status(200).json({
      ok: true,
      hasSpunToday,
      poolBalance: pool.balance,
      nextSpinAt: hasSpunToday ? nextDayStart.toISOString() : dayStart.toISOString(),
      prizes: MYST_CONFIG.WHEEL_PRIZES,
    });

  } catch (error: any) {
    console.error('[/api/wheel/status] Error:', error);
    return res.status(500).json({
      ok: false,
      hasSpunToday: false,
      poolBalance: 0,
      nextSpinAt: '',
      prizes: MYST_CONFIG.WHEEL_PRIZES,
      message: 'Failed to get wheel status',
    });
  }
}

