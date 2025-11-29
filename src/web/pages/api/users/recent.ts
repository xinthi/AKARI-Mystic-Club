/**
 * Recent Users API
 * 
 * GET /api/users/recent
 * 
 * Get recently active users (excluding current user)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';

interface RecentResponse {
  ok: boolean;
  users?: Array<{
    id: string;
    username?: string;
    firstName?: string;
    credibilityScore: number;
    positiveReviews: number;
    negativeReviews: number;
  }>;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RecentResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    // Get current user (optional)
    const currentUser = await getUserFromRequest(req, prisma).catch(() => null);

    // Get recently active users (those who have made transactions, bets, or reviews recently)
    // For simplicity, we'll get users with reviews or high credibility
    const users = await prisma.user.findMany({
      where: {
        // Exclude current user
        ...(currentUser ? { NOT: { id: currentUser.id } } : {}),
        // Only users with some activity (have a username or reviews)
        OR: [
          { username: { not: null } },
          { positiveReviews: { gt: 0 } },
          { negativeReviews: { gt: 0 } },
        ],
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        credibilityScore: true,
        positiveReviews: true,
        negativeReviews: true,
        updatedAt: true,
      },
      orderBy: [
        { updatedAt: 'desc' },
      ],
      take: 15,
    });

    return res.status(200).json({
      ok: true,
      users: users.map(u => ({
        id: u.id,
        username: u.username ?? undefined,
        firstName: u.firstName ?? undefined,
        credibilityScore: u.credibilityScore,
        positiveReviews: u.positiveReviews,
        negativeReviews: u.negativeReviews,
      })),
    });
  } catch (error: any) {
    console.error('[Users/Recent] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

