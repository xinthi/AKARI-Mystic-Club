/**
 * User Profile API
 *
 * GET: Fetch user profile (including X account connection status)
 * PATCH: Update profile
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await getUserFromRequest(req, prisma);

    if (!user) {
      return res.status(200).json({
        ok: false,
        user: null,
        message: 'Please open this app from Telegram to view your profile',
      });
    }

    if (req.method === 'GET') {
      // Fetch full user data with relations
      const fullUser = await prisma.user.findUnique({
        where: { id: user.id },
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

      if (!fullUser) {
        return res.status(200).json({
          ok: false,
          user: null,
          message: 'User not found.',
        });
      }

      return res.status(200).json({
        ok: true,
        user: {
          id: fullUser.id,
          telegramId: fullUser.telegramId,
          username: fullUser.username,
          firstName: fullUser.firstName,
          points: fullUser.points,
          tier: fullUser.tier,
          credibilityScore: (fullUser.credibilityScore ?? 0).toFixed(1),
          positiveReviews: fullUser.positiveReviews,
          createdAt: fullUser.createdAt,
          updatedAt: fullUser.updatedAt,
          // X account connection
          xConnected: fullUser.twitterAccounts.length > 0,
          xHandle: fullUser.twitterAccounts[0]?.handle ?? null,
          // Recent bets
          recentBets: fullUser.bets.map((bet) => ({
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
      const { tier } = req.body || {};

      const updateData: { tier?: string } = {};
      if (tier !== undefined) {
        updateData.tier = tier;
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      return res.status(200).json({
        ok: true,
        user: {
          id: updatedUser.id,
          tier: updatedUser.tier,
        },
      });
    }

    return res.status(405).json({ ok: false, user: null, message: 'Method not allowed' });
  } catch (error: any) {
    console.error('Profile API error:', error);
    return res.status(500).json({
      ok: false,
      user: null,
      message: 'Server error',
    });
  }
}
