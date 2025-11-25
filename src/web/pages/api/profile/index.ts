/**
 * User Profile API
 *
 * GET: Fetch user profile (including X account connection status)
 * PATCH: Update profile (wallets, language)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { prisma } from '../../../lib/prisma';

/**
 * Parse and verify Telegram initData, return telegramId
 */
function verifyAndParseInitData(initData: string, botToken: string): string | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');
    const dataCheckArr: string[] = [];
    Array.from(params.keys())
      .sort()
      .forEach((key) => {
        const value = params.get(key);
        if (value !== null) {
          dataCheckArr.push(`${key}=${value}`);
        }
      });

    const dataCheckString = dataCheckArr.join('\n');
    const secret = crypto.createHash('sha256').update(botToken).digest();
    const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

    if (hmac !== hash) return null;

    const userJson = params.get('user');
    if (!userJson) return null;

    const parsed = JSON.parse(userJson);
    return String(parsed.id);
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';

  // Try to read initData
  const initDataHeader =
    (req.headers['x-telegram-init-data'] as string | undefined) ||
    (typeof req.body === 'string' ? req.body : (req.body?.initData as string | undefined));

  let telegramId: string | null = null;
  if (initDataHeader) {
    telegramId = verifyAndParseInitData(initDataHeader, botToken);
  }

  // For profile routes, we need a user, but return a friendly message instead of 401
  if (!telegramId) {
    if (req.method === 'GET') {
      return res.status(200).json({
        user: null,
        message: 'Please open this app from Telegram to view your profile',
      });
    }
    if (req.method === 'PATCH') {
      return res.status(200).json({
        error: 'Authentication required',
        message: 'Please open this app from Telegram to update your profile',
      });
    }
  }

  try {
    if (req.method === 'GET') {
      if (!telegramId) {
        return res.status(200).json({
          user: null,
          message: 'Please open this app from Telegram to view your profile',
        });
      }

      const user = await prisma.user.findUnique({
        where: { telegramId },
        include: {
          twitterAccounts: {
            select: {
              id: true,
              twitterUserId: true,
              handle: true,
              createdAt: true,
            },
          },
          bets: {
            include: {
              prediction: {
                select: {
                  title: true,
                },
              },
            },
            take: 10,
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!user) {
        return res.status(200).json({
          user: null,
          message: 'User not found. Please authenticate first.',
        });
      }

      return res.status(200).json({
        user: {
          id: user.id,
          telegramId: user.telegramId,
          username: user.username,
          points: user.points,
          tier: user.tier,
          credibilityScore: (user.credibilityScore ?? 0).toFixed(1),
          positiveReviews: user.positiveReviews,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          // X account connection
          xConnected: user.twitterAccounts.length > 0,
          xHandle: user.twitterAccounts[0]?.handle ?? null,
          // Recent bets
          recentBets: user.bets.map((bet) => ({
            id: bet.id,
            predictionTitle: bet.prediction.title,
            option: bet.option,
            starsBet: bet.starsBet,
            pointsBet: bet.pointsBet,
            createdAt: bet.createdAt,
          })),
        },
      });
    }

    if (req.method === 'PATCH') {
      if (!telegramId) {
        return res.status(200).json({
          error: 'Authentication required',
          message: 'Please open this app from Telegram to update your profile',
        });
      }

      const { tier } = req.body || {};

      const updateData: { tier?: string } = {};
      if (tier !== undefined) {
        updateData.tier = tier;
      }

      const user = await prisma.user.update({
        where: { telegramId },
        data: updateData,
      });

      return res.status(200).json({
        user: {
          id: user.id,
          tier: user.tier,
        },
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Profile API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message }),
    });
  }
}
