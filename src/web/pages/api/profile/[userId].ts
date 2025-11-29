/**
 * Get User Profile by ID
 * 
 * GET /api/profile/[userId] - Get a specific user's public profile
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';

interface ProfileResponse {
  ok: boolean;
  user?: {
    id: string;
    username?: string;
    firstName?: string;
    points: number;
    tier?: string;
    credibilityScore: number;
    positiveReviews: number;
    negativeReviews: number;
  };
  currentUserId?: string;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProfileResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const { userId } = req.query;
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ ok: false, message: 'Invalid user ID' });
  }

  try {
    // Get current user if authenticated
    let currentUserId: string | undefined;
    try {
      const currentUser = await getUserFromRequest(req, prisma);
      currentUserId = currentUser?.id;
    } catch (_) {
      // Not authenticated, that's ok for viewing profiles
    }

    // Get the requested user's profile
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        firstName: true,
        points: true,
        tier: true,
        credibilityScore: true,
        positiveReviews: true,
        negativeReviews: true,
      },
    });

    if (!user) {
      return res.status(404).json({ ok: false, message: 'User not found' });
    }

    return res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        username: user.username || undefined,
        firstName: user.firstName || undefined,
        points: user.points,
        tier: user.tier || undefined,
        credibilityScore: user.credibilityScore,
        positiveReviews: user.positiveReviews,
        negativeReviews: user.negativeReviews,
      },
      currentUserId,
    });
  } catch (error: any) {
    console.error('[Profile] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}
