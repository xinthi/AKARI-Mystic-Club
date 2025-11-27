/**
 * Get/Generate Referral Code API
 * 
 * GET /api/referral/code
 * Returns the user's referral code, generating one if they don't have one.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { generateReferralCode } from '../../../lib/myst-service';

type Data =
  | {
      ok: true;
      referralCode: string;
      referralLink: string;
      referralCount: number;
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

    let referralCode = user.referralCode;

    // Generate code if user doesn't have one
    if (!referralCode) {
      referralCode = generateReferralCode(user.telegramId);
      
      // Save to database
      await prisma.user.update({
        where: { id: user.id },
        data: { referralCode },
      });
    }

    // Count referrals
    const referralCount = await prisma.user.count({
      where: { referrerId: user.id },
    });

    // Build referral link (Telegram deep link)
    const botUsername = 'AKARIMystic_Bot'; // Your bot username
    const referralLink = `https://t.me/${botUsername}?start=ref_${referralCode}`;

    return res.status(200).json({
      ok: true,
      referralCode,
      referralLink,
      referralCount,
    });
  } catch (error: any) {
    console.error('[/api/referral/code] Error:', error);
    return res.status(500).json({ ok: false, reason: 'Server error' });
  }
}

