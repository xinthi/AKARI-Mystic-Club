/**
 * Mark Onboarding as Seen
 * 
 * POST /api/user/onboarding-seen
 * 
 * Marks the user's hasSeenOnboardingGuide flag as true
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';

interface Response {
  ok: boolean;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Response>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    const user = await getUserFromRequest(req, prisma);
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { hasSeenOnboardingGuide: true },
    });

    console.log(`[Onboarding] User ${user.id} marked onboarding as seen`);

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('[Onboarding] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

