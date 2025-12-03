/**
 * Portal Telegram Authentication
 * 
 * Verifies Telegram WebApp initData and creates/updates PortalUserProfile
 * Returns a session token/cookie for portal access
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../../lib/prisma';
import { verifyTelegramWebAppData, parseTelegramInitData } from '../../../../lib/telegram-auth';

type AuthResponse =
  | { ok: true; user: { id: string; telegramId: string; username?: string; level: string }; token?: string }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AuthResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Get initData from request body or query
    const initData = req.body.initData || req.query.initData;

    if (!initData || typeof initData !== 'string') {
      return res.status(400).json({ ok: false, error: 'initData is required' });
    }

    // Verify Telegram signature
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' });
    }

    const isValid = verifyTelegramWebAppData(initData, botToken);
    if (!isValid) {
      return res.status(401).json({ ok: false, error: 'Invalid Telegram signature' });
    }

    // Parse user data
    const authData = parseTelegramInitData(initData);
    if (!authData || !authData.user) {
      return res.status(401).json({ ok: false, error: 'Invalid user data' });
    }

    const telegramUser = authData.user;

    // Create or update PortalUserProfile
    const profile = await withDbRetry(() =>
      prisma.portalUserProfile.upsert({
        where: { telegramId: telegramUser.id.toString() },
        update: {
          username: telegramUser.username || undefined,
          avatarUrl: telegramUser.photo_url || undefined,
          updatedAt: new Date(),
        },
        create: {
          telegramId: telegramUser.id.toString(),
          username: telegramUser.username || undefined,
          avatarUrl: telegramUser.photo_url || undefined,
          level: 'L1', // Default level
        },
      })
    );

    // For now, return user data directly
    // In production, you might want to create a JWT or session cookie here
    return res.status(200).json({
      ok: true,
      user: {
        id: profile.id,
        telegramId: profile.telegramId,
        username: profile.username || undefined,
        level: profile.level,
      },
    });
  } catch (error: any) {
    console.error('[Portal Auth] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Internal server error',
    });
  }
}

