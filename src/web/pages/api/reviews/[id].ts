/**
 * Get Reviews for a User
 * 
 * GET /api/reviews/[id] - List reviews for a given user (reviewee)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';

interface ReviewListResponse {
  ok: boolean;
  reviews?: any[];
  summary?: {
    credibilityScore: number;
    positiveReviews: number;
    negativeReviews: number;
  };
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReviewListResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, message: 'Invalid user ID' });
  }

  try {
    // Get user info
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        credibilityScore: true,
        positiveReviews: true,
        negativeReviews: true,
      },
    });

    if (!user) {
      return res.status(404).json({ ok: false, message: 'User not found' });
    }

    // Get latest 20 reviews for this user
    const reviews = await prisma.review.findMany({
      where: { revieweeId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        reviewer: {
          select: {
            id: true,
            username: true,
            firstName: true,
            credibilityScore: true,
          },
        },
      },
    });

    return res.status(200).json({
      ok: true,
      reviews: reviews.map((r) => ({
        id: r.id,
        reviewer: {
          id: r.reviewer.id,
          username: r.reviewer.username,
          firstName: r.reviewer.firstName,
          credibilityScore: r.reviewer.credibilityScore,
        },
        score: r.score,
        comment: r.comment,
        link: r.link,
        createdAt: r.createdAt.toISOString(),
      })),
      summary: {
        credibilityScore: user.credibilityScore,
        positiveReviews: user.positiveReviews,
        negativeReviews: user.negativeReviews,
      },
    });
  } catch (error: any) {
    console.error('[Reviews] List error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

