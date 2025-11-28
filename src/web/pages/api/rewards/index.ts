/**
 * Rewards List API
 * 
 * GET /api/rewards
 * 
 * TON rewards have been removed. This endpoint now returns
 * recognition info for the leaderboard.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { getMystBalance } from '../../../lib/myst-service';

type Data =
  | {
      ok: true;
      mystBalance: number;
      message: string;
    }
  | { ok: false; reason: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, reason: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await getUserFromRequest(req, prisma);
    if (!user) {
      return res.status(401).json({ ok: false, reason: 'Unauthorized' });
    }

    // Get MYST balance
    const mystBalance = await getMystBalance(prisma, user.id);

    return res.status(200).json({
      ok: true,
      mystBalance,
      message: 'Weekly recognition is now shown on the leaderboard. Top 10 players are highlighted every Tuesday!',
    });
  } catch (error: any) {
    console.error('[/api/rewards] Error:', error);
    return res.status(500).json({ ok: false, reason: 'Server error' });
  }
}
