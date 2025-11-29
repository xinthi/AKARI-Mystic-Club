/**
 * Search Users API
 * 
 * GET /api/users/search?q=username
 * 
 * Search for users by username or firstName
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';

interface SearchResponse {
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
  res: NextApiResponse<SearchResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    // Authenticate user (optional but recommended)
    const currentUser = await getUserFromRequest(req, prisma).catch(() => null);
    
    const query = req.query.q as string | undefined;
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ ok: false, message: 'Search query must be at least 2 characters' });
    }

    const searchTerm = query.trim().toLowerCase();
    
    // Remove @ if present
    const cleanSearch = searchTerm.startsWith('@') ? searchTerm.slice(1) : searchTerm;

    // Search users by username or firstName
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: cleanSearch, mode: 'insensitive' } },
          { firstName: { contains: cleanSearch, mode: 'insensitive' } },
        ],
        // Don't return the current user in results
        ...(currentUser ? { NOT: { id: currentUser.id } } : {}),
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        credibilityScore: true,
        positiveReviews: true,
        negativeReviews: true,
      },
      orderBy: [
        { credibilityScore: 'desc' },
        { positiveReviews: 'desc' },
      ],
      take: 20,
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
    console.error('[Users/Search] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

