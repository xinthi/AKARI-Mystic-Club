/**
 * User Profile API
 * 
 * GET: Fetch user profile
 * PATCH: Update profile (interests, wallets, language)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getTelegramUserFromRequest } from '../../../lib/telegram-auth';
import { z } from 'zod';

const updateProfileSchema = z.object({
  interests: z.array(z.enum(['content_creator', 'airdrop_hunter', 'investor', 'founder', 'new_to_crypto'])).optional(),
  tonWallet: z.string().optional(),
  evmWallet: z.string().optional(),
  language: z.string().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get user from Telegram init data
  const telegramUser = getTelegramUserFromRequest(req);
  
  if (!telegramUser) {
    return res.status(401).json({ error: 'Unauthorized - Invalid Telegram auth' });
  }

  const telegramId = BigInt(telegramUser.id);

  try {
    if (req.method === 'GET') {
      // Fetch user profile
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
        return res.status(404).json({ error: 'User not found' });
      }

      // Calculate credibility score
      const reviews = user.reviewsReceived;
      const avgRating = reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
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
          recentBets: user.bets.map(bet => ({
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

