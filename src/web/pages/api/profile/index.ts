/**
 * User Profile API
 *
 * GET: Fetch user profile (including MYST balance, referral info, X connection)
 * PATCH: Update profile
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest, getTelegramUserFromRequest } from '../../../lib/telegram-auth';
import { getMystBalance, generateReferralCode } from '../../../lib/myst-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Debug: log what headers we received
    const initDataHeader = req.headers['x-telegram-init-data'] as string | undefined;
    console.log('[Profile API] initData header length:', initDataHeader?.length || 0);

    let user = await getUserFromRequest(req, prisma);

    // If no user but we have valid initData, create the user
    if (!user && initDataHeader) {
      const telegramUser = getTelegramUserFromRequest(req);
      
      if (telegramUser) {
        console.log('[Profile API] Creating new user for telegramId:', telegramUser.id);
        
        // Generate referral code
        const referralCode = generateReferralCode(String(telegramUser.id));
        
        // Create new user from Telegram data
        user = await prisma.user.create({
          data: {
            telegramId: String(telegramUser.id),
            username: telegramUser.username,
            firstName: telegramUser.first_name,
            lastName: telegramUser.last_name,
            photoUrl: telegramUser.photo_url,
            referralCode,
          },
        });
        
        console.log('[Profile API] Created user:', user.id);
      } else {
        console.warn('[Profile API] initData present but failed to parse/verify');
      }
    }

    if (!user) {
      console.warn('[Profile API] No user resolved - returning auth error');
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
          referrer: {
            select: {
              username: true,
            },
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

      // Get MYST balance
      const mystBalance = await getMystBalance(prisma, fullUser.id);

      // Count referrals
      const referralCount = await prisma.user.count({
        where: { referrerId: fullUser.id },
      });

      // Generate referral code if not exists
      let referralCode = fullUser.referralCode;
      if (!referralCode) {
        referralCode = generateReferralCode(fullUser.telegramId);
        await prisma.user.update({
          where: { id: fullUser.id },
          data: { referralCode },
        });
      }

      return res.status(200).json({
        ok: true,
        user: {
          id: fullUser.id,
          telegramId: fullUser.telegramId,
          username: fullUser.username,
          firstName: fullUser.firstName,
          points: fullUser.points, // aXP
          tier: fullUser.tier,
          credibilityScore: (fullUser.credibilityScore ?? 0).toFixed(1),
          positiveReviews: fullUser.positiveReviews,
          createdAt: fullUser.createdAt,
          updatedAt: fullUser.updatedAt,
          
          // MYST Economy
          mystBalance,
          
          // Referral system
          referralCode,
          referralLink: `https://t.me/AKARIMystic_Bot?start=ref_${referralCode}`,
          referralCount,
          referredBy: fullUser.referrer?.username || null,
          
          // TON wallet
          tonWallet: fullUser.tonWallet,
          
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
            mystBet: bet.mystBet,
            createdAt: bet.createdAt,
          })),
        },
      });
    }

    if (req.method === 'PATCH') {
      const { tier, tonWallet } = req.body || {};

      const updateData: { tier?: string; tonWallet?: string } = {};
      if (tier !== undefined) {
        updateData.tier = tier;
      }
      if (tonWallet !== undefined) {
        // Basic TON wallet validation
        if (tonWallet && !/^(EQ|UQ)[a-zA-Z0-9_-]{46}$/.test(tonWallet)) {
          return res.status(400).json({ ok: false, user: null, message: 'Invalid TON wallet format' });
        }
        updateData.tonWallet = tonWallet || null;
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
          tonWallet: updatedUser.tonWallet,
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
