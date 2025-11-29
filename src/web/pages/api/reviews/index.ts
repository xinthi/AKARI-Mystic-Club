/**
 * Reviews API
 * 
 * POST /api/reviews - Create or update a review
 * 
 * Rules:
 * - Cannot review yourself
 * - One review per reviewer→reviewee pair (can update)
 * - Score must be +1 or -1
 * - Comment max 255 chars
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';

interface ReviewResponse {
  ok: boolean;
  review?: any;
  summary?: {
    credibilityScore: number;
    positiveReviews: number;
    negativeReviews: number;
  };
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReviewResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await getUserFromRequest(req, prisma);
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    const { revieweeId, score, comment, link } = req.body;

    // Validate revieweeId
    if (!revieweeId || typeof revieweeId !== 'string') {
      return res.status(400).json({ ok: false, message: 'revieweeId is required' });
    }

    // Cannot review yourself
    if (revieweeId === user.id) {
      return res.status(400).json({ ok: false, message: 'You cannot review yourself' });
    }

    // Validate score
    if (score !== 1 && score !== -1) {
      return res.status(400).json({ ok: false, message: 'Score must be +1 or -1' });
    }

    // Validate comment
    if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
      return res.status(400).json({ ok: false, message: 'Comment is required' });
    }
    if (comment.length > 255) {
      return res.status(400).json({ ok: false, message: 'Comment must be 255 characters or less' });
    }

    // Validate link if provided
    if (link && (typeof link !== 'string' || link.length > 255)) {
      return res.status(400).json({ ok: false, message: 'Link must be 255 characters or less' });
    }

    // Check reviewee exists
    const reviewee = await prisma.user.findUnique({
      where: { id: revieweeId },
      select: { id: true },
    });
    if (!reviewee) {
      return res.status(404).json({ ok: false, message: 'User not found' });
    }

    // Upsert review (create or update)
    const review = await prisma.review.upsert({
      where: {
        reviewerId_revieweeId: {
          reviewerId: user.id,
          revieweeId: revieweeId,
        },
      },
      update: {
        score,
        comment: comment.trim(),
        link: link?.trim() || null,
      },
      create: {
        reviewerId: user.id,
        revieweeId: revieweeId,
        score,
        comment: comment.trim(),
        link: link?.trim() || null,
      },
    });

    // Recalculate reviewee's credibility
    const positiveCount = await prisma.review.count({
      where: { revieweeId, score: 1 },
    });
    const negativeCount = await prisma.review.count({
      where: { revieweeId, score: -1 },
    });
    const credibilityScore = positiveCount - negativeCount;

    // Update reviewee's stats
    await prisma.user.update({
      where: { id: revieweeId },
      data: {
        positiveReviews: positiveCount,
        negativeReviews: negativeCount,
        credibilityScore,
      },
    });

    console.log(`[Reviews] User ${user.id} reviewed ${revieweeId}: score=${score}`);

    return res.status(200).json({
      ok: true,
      review: {
        id: review.id,
        score: review.score,
        comment: review.comment,
        link: review.link,
        createdAt: review.createdAt.toISOString(),
        updatedAt: review.updatedAt.toISOString(),
      },
      summary: {
        credibilityScore,
        positiveReviews: positiveCount,
        negativeReviews: negativeCount,
      },
    });
  } catch (error: any) {
    console.error('[Reviews] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

