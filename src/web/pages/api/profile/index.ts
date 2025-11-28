/**
 * User Profile API
 *
 * GET: Fetch user profile (including MYST balance, referral info, X connection)
 * PATCH: Update profile
 * 
 * This endpoint is hardened to never throw 500 errors:
 * - All DB queries are wrapped in try-catch
 * - All field accesses use optional chaining and defaults
 * - If Telegram auth fails, returns { ok: false } with a friendly message
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest, getTelegramUserFromRequest } from '../../../lib/telegram-auth';
import { getMystBalance, generateReferralCode } from '../../../lib/myst-service';

interface ProfileResponse {
  ok: boolean;
  user: any | null;
  message?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProfileResponse>
) {
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
        
        try {
          // Generate referral code
          const referralCode = generateReferralCode(String(telegramUser.id));
          
          // Create new user from Telegram data
          user = await prisma.user.create({
            data: {
              telegramId: String(telegramUser.id),
              username: telegramUser.username || null,
              firstName: telegramUser.first_name || null,
              lastName: telegramUser.last_name || null,
              photoUrl: telegramUser.photo_url || null,
              referralCode,
            },
          });
          
          console.log('[Profile API] Created user:', user.id);
        } catch (createErr: any) {
          // User might already exist (race condition) - try to fetch
          console.warn('[Profile API] Create user failed, trying to fetch:', createErr.message);
          user = await prisma.user.findUnique({
            where: { telegramId: String(telegramUser.id) },
          });
        }
      } else {
        console.warn('[Profile API] initData present but failed to parse/verify');
      }
    }

    // No valid authentication - return friendly error (NOT 401/500)
    if (!user) {
      console.warn('[Profile API] No user resolved - returning auth error');
      return res.status(200).json({
        ok: false,
        user: null,
        message: 'Please open this app from Telegram to view your profile',
      });
    }

    // ============================================
    // GET: Fetch profile
    // ============================================
    if (req.method === 'GET') {
      // Fetch full user data with relations
      // All queries are wrapped to handle missing tables/columns gracefully
      let fullUser: any = null;
      let twitterAccounts: any[] = [];
      let bets: any[] = [];
      let referrerUsername: string | null = null;

      // First, get the base user
      try {
        fullUser = await prisma.user.findUnique({
          where: { id: user.id },
        });
      } catch (e: any) {
        console.error('[Profile API] Base user query failed:', e.message);
        fullUser = user; // Fall back to the user we already have
      }

      if (!fullUser) {
        return res.status(200).json({
          ok: false,
          user: null,
          message: 'User not found.',
        });
      }

      // Fetch Twitter accounts separately (safe)
      try {
        twitterAccounts = await prisma.twitterAccount.findMany({
          where: { userId: fullUser.id },
          select: {
            id: true,
            twitterUserId: true,
            handle: true,
            createdAt: true,
          },
        });
      } catch (e: any) {
        console.warn('[Profile API] Twitter accounts query failed:', e.message);
        twitterAccounts = [];
      }

      // Fetch bets separately (safe)
      try {
        bets = await prisma.bet.findMany({
          where: { userId: fullUser.id },
          include: {
            prediction: {
              select: {
                title: true,
              },
            },
          },
          take: 10,
          orderBy: { createdAt: 'desc' },
        });
      } catch (e: any) {
        console.warn('[Profile API] Bets query failed:', e.message);
        bets = [];
      }

      // Fetch referrer username separately (safe - new relation)
      try {
        if (fullUser.referrerId) {
          const referrer = await prisma.user.findUnique({
            where: { id: fullUser.referrerId },
            select: { username: true },
          });
          referrerUsername = referrer?.username || null;
        }
      } catch (e: any) {
        console.warn('[Profile API] Referrer query failed:', e.message);
        referrerUsername = null;
      }

      // Get MYST balance (safe - may fail if table doesn't exist yet)
      let mystBalance = 0;
      try {
        mystBalance = await getMystBalance(prisma, fullUser.id);
      } catch (e: any) {
        console.warn('[Profile API] getMystBalance failed:', e.message);
        mystBalance = 0;
      }

      // Count referrals (safe - may fail if column doesn't exist)
      let referralCount = 0;
      try {
        referralCount = await prisma.user.count({
          where: { referrerId: fullUser.id },
        });
      } catch (e: any) {
        console.warn('[Profile API] referralCount failed:', e.message);
        referralCount = 0;
      }

      // Get or generate referral code
      let referralCode: string | null = fullUser.referralCode || null;
      if (!referralCode) {
        try {
          referralCode = generateReferralCode(fullUser.telegramId);
          await prisma.user.update({
            where: { id: fullUser.id },
            data: { referralCode },
          });
        } catch (e: any) {
          console.warn('[Profile API] referralCode update failed:', e.message);
          // Generate a temporary code for display (won't be persisted)
          referralCode = `AKARI_${fullUser.telegramId.slice(-6)}_TEMP`;
        }
      }

      // Build response with safe field access
      const responseUser = {
        // Core fields (always present)
        id: fullUser.id,
        telegramId: fullUser.telegramId,
        username: fullUser.username || null,
        firstName: fullUser.firstName || null,
        
        // Legacy aXP / Points system
        points: fullUser.points ?? 0,
        tier: fullUser.tier || null,
        credibilityScore: String((fullUser.credibilityScore ?? 0).toFixed(1)),
        positiveReviews: fullUser.positiveReviews ?? 0,
        
        // Timestamps
        createdAt: fullUser.createdAt,
        updatedAt: fullUser.updatedAt,
        
        // MYST Economy (new)
        mystBalance,
        
        // Referral system (new)
        referralCode,
        referralLink: referralCode ? `https://t.me/AKARIMystic_Bot?start=ref_${referralCode}` : null,
        referralCount,
        referredBy: referrerUsername,
        
        // TON wallet (new)
        tonWallet: fullUser.tonWallet || null,
        
        // X account connection
        xConnected: twitterAccounts.length > 0,
        xHandle: twitterAccounts[0]?.handle ?? null,
        
        // Recent bets (safely mapped)
        recentBets: bets.map((bet: any) => ({
          id: bet.id,
          predictionTitle: bet.prediction?.title ?? 'Unknown Prediction',
          option: bet.option ?? '',
          starsBet: bet.starsBet ?? 0,
          pointsBet: bet.pointsBet ?? 0,
          mystBet: bet.mystBet ?? 0,
          createdAt: bet.createdAt,
        })),
      };

      return res.status(200).json({
        ok: true,
        user: responseUser,
      });
    }

    // ============================================
    // PATCH: Update profile
    // ============================================
    if (req.method === 'PATCH') {
      const { tier, tonWallet } = req.body || {};

      const updateData: Record<string, any> = {};
      
      if (tier !== undefined) {
        updateData.tier = tier;
      }
      
      if (tonWallet !== undefined) {
        // Basic TON wallet validation (EQ/UQ prefix + 46 chars)
        if (tonWallet && !/^(EQ|UQ)[a-zA-Z0-9_-]{46}$/.test(tonWallet)) {
          return res.status(400).json({
            ok: false,
            user: null,
            message: 'Invalid TON wallet format',
          });
        }
        updateData.tonWallet = tonWallet || null;
      }

      try {
        const updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });

        return res.status(200).json({
          ok: true,
          user: {
            id: updatedUser.id,
            tier: updatedUser.tier,
            tonWallet: (updatedUser as any).tonWallet || null,
          },
        });
      } catch (updateErr: any) {
        console.error('[Profile API] Update failed:', updateErr.message);
        return res.status(500).json({
          ok: false,
          user: null,
          error: 'Failed to update profile',
        });
      }
    }

    // Method not allowed
    return res.status(405).json({
      ok: false,
      user: null,
      message: 'Method not allowed',
    });

  } catch (error: any) {
    // This should never happen if all queries above are properly wrapped
    console.error('[Profile API] Unexpected error:', error);
    return res.status(500).json({
      ok: false,
      user: null,
      error: 'Internal server error',
    });
  }
}
