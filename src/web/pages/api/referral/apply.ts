/**
 * Apply Referral Code API
 * 
 * POST /api/referral/apply
 * Applies a referral code to the current user.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { applyReferralCode, generateReferralCode } from '../../../lib/myst-service';

type Data =
  | {
      ok: true;
      referrerUsername?: string;
      message: string;
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

    const { referralCode } = req.body as { referralCode?: string };

    if (!referralCode || typeof referralCode !== 'string') {
      return res.status(400).json({ ok: false, reason: 'Missing referral code' });
    }

    // Apply the referral code
    const result = await applyReferralCode(prisma, user.id, referralCode.trim());

    if (!result.success) {
      return res.status(400).json({ ok: false, reason: result.error || 'Failed to apply code' });
    }

    return res.status(200).json({
      ok: true,
      referrerUsername: result.referrerUsername,
      message: result.referrerUsername
        ? `Successfully linked to ${result.referrerUsername}!`
        : 'Referral code applied successfully!',
    });
  } catch (error: any) {
    console.error('[/api/referral/apply] Error:', error);
    return res.status(500).json({ ok: false, reason: 'Server error' });
  }
}

