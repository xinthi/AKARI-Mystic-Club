import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../lib/prisma';
import { verifyTelegramWebAppData, parseTelegramInitData } from '../../../lib/telegram-auth';
import { grantOnboardingMystIfEligible, getMystBalance } from '../../../lib/myst-service';

interface TelegramAuthResponse {
  ok: boolean;
  user?: {
    id: string;
    username?: string;
    first_name?: string;
    last_name?: string;
    photo_url?: string;
    points: number;
    tier?: string;
    credibilityScore: string;
    positiveReviews: number;
    mystBalance: number;
    hasSeenOnboardingGuide: boolean;
  } | null;
  reason?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TelegramAuthResponse>
) {
  // Accept both POST and GET
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, user: null, reason: 'Method not allowed' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[/api/auth/telegram] Missing TELEGRAM_BOT_TOKEN env var');
    return res.status(500).json({
      ok: false,
      user: null,
      reason: 'Server misconfigured',
    });
  }

  // initData may come from body.initData (POST) or header x-telegram-init-data (GET/POST)
  let initData = '';
  if (req.method === 'POST') {
    initData =
      (typeof req.body === 'string'
        ? req.body
        : (req.body?.initData as string | undefined)) || '';
  }
  if (!initData) {
    initData = (req.headers['x-telegram-init-data'] as string | undefined) || '';
  }

  console.log('[/api/auth/telegram] initData length:', initData?.length ?? 0);

  if (!initData) {
    console.warn('[/api/auth/telegram] No initData provided - guest mode');
    return res.status(200).json({
      ok: true,
      user: null,
      reason: 'No initData (guest mode)',
    });
  }

  // Use shared verification helper
  if (!verifyTelegramWebAppData(initData, botToken)) {
    console.error('[/api/auth/telegram] Signature verification failed');
    return res.status(401).json({
      ok: false,
      user: null,
      reason: 'invalid signature',
    });
  }

  // Use shared parsing helper
  const authData = parseTelegramInitData(initData);
  if (!authData || !authData.user) {
    console.warn('[/api/auth/telegram] Failed to parse user from initData');
    return res.status(200).json({
      ok: true,
      user: null,
      reason: 'No user data in initData',
    });
  }

  const { user: tgUser } = authData;
  const telegramId = String(tgUser.id);
  const username = tgUser.username;
  const firstName = tgUser.first_name;
  const lastName = tgUser.last_name;
  const photoUrl = tgUser.photo_url;

  console.log('[/api/auth/telegram] Verified user:', telegramId);

  // Upsert user in the database
  const dbUser = await withDbRetry(() => prisma.user.upsert({
    where: { telegramId },
    update: {
      username,
      firstName,
      lastName,
      photoUrl,
    },
    create: {
      telegramId,
      username,
      firstName,
      lastName,
      photoUrl,
    },
  }));

  // Try to grant onboarding MYST bonus (5 MYST until 2026-01-01)
  // This is fire-and-forget - auth should succeed even if bonus fails
  try {
    const bonusResult = await grantOnboardingMystIfEligible(prisma, dbUser.id);
    if (bonusResult.granted) {
      console.log('[Auth] Granted onboarding MYST bonus', {
        userId: dbUser.id,
        amount: bonusResult.amount,
      });
    }
  } catch (e) {
    console.error('[Auth] Failed to grant onboarding MYST bonus', e);
  }

  // Get MYST balance
  let mystBalance = 0;
  try {
    mystBalance = await getMystBalance(prisma, dbUser.id);
  } catch (e) {
    console.error('[Auth] Failed to get MYST balance', e);
  }

  // Fetch user with hasSeenOnboardingGuide
  const fullUser = await withDbRetry(() => prisma.user.findUnique({
    where: { id: dbUser.id },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      points: true,
      tier: true,
      credibilityScore: true,
      positiveReviews: true,
      hasSeenOnboardingGuide: true,
    },
  }));

  return res.status(200).json({
    ok: true,
    user: {
      id: fullUser?.id || dbUser.id,
      username: fullUser?.username ?? undefined,
      first_name: fullUser?.firstName ?? firstName ?? undefined,
      last_name: fullUser?.lastName ?? lastName ?? undefined,
      photo_url: fullUser?.photoUrl ?? photoUrl ?? undefined,
      points: fullUser?.points || 0,
      tier: fullUser?.tier ?? undefined,
      credibilityScore: (fullUser?.credibilityScore ?? 0).toString(),
      positiveReviews: fullUser?.positiveReviews || 0,
      mystBalance,
      hasSeenOnboardingGuide: fullUser?.hasSeenOnboardingGuide ?? false,
    },
    reason: 'Authenticated via Telegram WebApp',
  });
}
