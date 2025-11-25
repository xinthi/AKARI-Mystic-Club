/**
 * Telegram Authentication API
 * 
 * Verifies Telegram init data and creates/updates user in database
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { verifyTelegramWebAppData, parseTelegramInitData } from '../../../lib/telegram-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { initData } = req.body;

    if (!initData || typeof initData !== 'string') {
      return res.status(400).json({ error: 'initData is required' });
    }

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(500).json({ error: 'Bot token not configured' });
    }

    // Verify Telegram init data signature
    if (!verifyTelegramWebAppData(initData, process.env.TELEGRAM_BOT_TOKEN)) {
      return res.status(401).json({ error: 'Invalid Telegram signature' });
    }

    // Parse init data
    const authData = parseTelegramInitData(initData);
    if (!authData) {
      return res.status(400).json({ error: 'Invalid init data format' });
    }

    const { user: telegramUser } = authData;
    const telegramId = BigInt(telegramUser.id);

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { telegramId },
      include: {
        reviewsReceived: true
      }
    });

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          telegramId,
          username: telegramUser.username,
          language: telegramUser.language_code || 'en',
          points: 0,
          credibilityScore: 0,
          positiveReviews: 0
        },
        include: {
          reviewsReceived: true
        }
      });
    } else {
      // Update existing user
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: telegramUser.username || user.username,
          lastActive: new Date()
        },
        include: {
          reviewsReceived: true
        }
      });
    }

    // Calculate credibility score from reviews
    const reviews = user.reviewsReceived;
    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;
    const credibilityScore = avgRating * 2; // Scale 1-5 to 0-10

    // Return user profile (without sensitive data)
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
        lastActive: user.lastActive
      }
    });
  } catch (error: any) {
    console.error('Telegram auth error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
}

