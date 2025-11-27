/**
 * Stars to MYST Conversion API
 * 
 * POST /api/myst/convert
 * Converts Telegram Stars to MYST tokens.
 * 
 * Rate: 100 Stars = 1 MYST
 * 
 * Note: In production, this should be called after verifying
 * a Telegram Stars payment. For now, it's a stub that assumes
 * the Stars balance has been verified elsewhere.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { convertStarsToMyst, MYST_CONFIG } from '../../../lib/myst-service';

type Data =
  | {
      ok: true;
      starsConverted: number;
      mystReceived: number;
      newBalance: number;
    }
  | { ok: false; reason: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await getUserFromRequest(req, prisma);
    if (!user) {
      return res.status(401).json({ ok: false, reason: 'Unauthorized' });
    }

    const { starsAmount } = req.body as { starsAmount?: number };

    if (!starsAmount || typeof starsAmount !== 'number' || starsAmount <= 0) {
      return res.status(400).json({ ok: false, reason: 'Invalid stars amount' });
    }

    // Minimum conversion: at least enough for 0.01 MYST
    if (starsAmount < 1) {
      return res.status(400).json({
        ok: false,
        reason: `Minimum conversion is 1 Star`,
      });
    }

    // Process conversion
    // TODO: In production, verify Stars payment with Telegram before converting
    const { mystReceived, newBalance } = await convertStarsToMyst(
      prisma,
      user.id,
      starsAmount
    );

    console.log(
      `[/api/myst/convert] User ${user.telegramId} converted ${starsAmount} Stars to ${mystReceived} MYST`
    );

    return res.status(200).json({
      ok: true,
      starsConverted: starsAmount,
      mystReceived,
      newBalance,
    });
  } catch (error: any) {
    console.error('[/api/myst/convert] Error:', error);
    return res.status(500).json({ ok: false, reason: error.message || 'Server error' });
  }
}

