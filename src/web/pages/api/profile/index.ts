/**
 * User Profile API
 * 
 * GET: Fetch user profile
 * PATCH: Update profile (interests, wallets, language)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { z } from 'zod';

const updateProfileSchema = z.object({
  interests: z.array(z.enum(['content_creator', 'airdrop_hunter', 'investor', 'founder', 'new_to_crypto'])).optional(),
  tonWallet: z.string().optional(),
  evmWallet: z.string().optional(),
  language: z.string().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Try to read initData, but never crash the request
  const initDataHeader =
    (req.headers['x-telegram-init-data'] as string | undefined) ||
    (typeof req.body === 'string'
      ? req.body
      : (req.body?.initData as string | undefined));

  let userId: string | number | null = null;

  if (initDataHeader) {
    try {
      const params = new URLSearchParams(initDataHeader);
      const userJson = params.get('user');
      if (userJson) {
        const parsed = JSON.parse(userJson);
        userId = parsed.id;
      } else {
        console.warn('No user in initData for /api/profile');
      }
    } catch (err) {
      console.error('Failed to parse Telegram initData for /api/profile:', err);
    }
  } else {
    console.warn('No X-Telegram-Init-Data header for /api/profile');
  }

  // For profile routes, we need a user, but return a friendly message instead of 401
  if (!userId) {
    if (req.method === 'GET') {
      return res.status(200).json({ 
        user: null,
        message: 'Please open this app from Telegram to view your profile'
      });
    }
    if (req.method === 'PATCH') {
      return res.status(200).json({ 
        error: 'Authentication required',
        message: 'Please open this app from Telegram to update your profile'
      });
    }
  }

  const telegramId = userId ? BigInt(userId) : null;

  try {
    if (req.method === 'GET') {
      // Fetch user profile
      if (!telegramId) {
        return res.status(200).json({ 
          user: null,
          message: 'Please open this app from Telegram to view your profile'
        });
      }

      const user = await prisma.user.findUnique({
        where: { telegramId },
        include: {
          reviewsReceived: true,
          bets: {
            include: {
              prediction: true
            },
            take: 10,
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!user) {
        return res.status(200).json({ 
          user: null,
          message: 'User not found. Please authenticate first.'
        });
      }

      // Calculate credibility score
      const reviews = user.reviewsReceived;
      const avgRating = reviews.length > 0
        ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length
        : 0;
      const credibilityScore = avgRating * 2;

      return res.status(200).json({
        user: {
          id: user.id,
          telegramId: user.telegramId.toString(),
          username: user.username,
          points: user.points,
          tier: user.tier,
          credibilityScore: credibilityScore.toFixed(1),
          positiveReviews: user.positiveReviews,
          interests: user.interests,
          tonWallet: user.tonWallet,
          evmWallet: user.evmWallet,
          language: user.language,
          joinedAt: user.joinedAt,
          lastActive: user.lastActive,
          recentBets: user.bets.map((bet: any) => ({
            id: bet.id,
            predictionTitle: bet.prediction.title,
            optionIndex: bet.optionIndex,
            starsBet: bet.starsBet,
            pointsBet: bet.pointsBet,
            createdAt: bet.createdAt
          }))
        }
      });
    }

    if (req.method === 'PATCH') {
      // Update user profile
      const validation = updateProfileSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'Invalid request data',
          details: validation.error.errors
        });
      }

      const updateData: any = {};
      
      if (validation.data.interests !== undefined) {
        updateData.interests = { set: validation.data.interests };
        updateData.isNewToCrypto = validation.data.interests.includes('new_to_crypto');
      }
      
      if (validation.data.tonWallet !== undefined) {
        updateData.tonWallet = validation.data.tonWallet;
      }
      
      if (validation.data.evmWallet !== undefined) {
        updateData.evmWallet = validation.data.evmWallet;
      }
      
      if (validation.data.language !== undefined) {
        updateData.language = validation.data.language;
      }

      if (!telegramId) {
        return res.status(200).json({ 
          error: 'Authentication required',
          message: 'Please open this app from Telegram to update your profile'
        });
      }

      const user = await prisma.user.update({
        where: { telegramId },
        data: updateData
      });

      return res.status(200).json({
        user: {
          id: user.id,
          interests: user.interests,
          tonWallet: user.tonWallet,
          evmWallet: user.evmWallet,
          language: user.language
        }
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Profile API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
}

