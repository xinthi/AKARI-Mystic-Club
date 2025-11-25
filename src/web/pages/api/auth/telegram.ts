import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { prisma } from '../../../lib/prisma';

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
  } | null;
  reason?: string;
}

/**
 * Verify Telegram WebApp initData according to:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
 */
function verifyTelegramInitData(
  initData: string,
  botToken: string
): { valid: boolean; data?: URLSearchParams } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { valid: false };

    // Build data_check_string
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

    // secret = SHA256(botToken)
    const secret = crypto.createHash('sha256').update(botToken).digest();

    // hmac = HMAC-SHA256(secret, dataCheckString)
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(dataCheckString)
      .digest('hex');

    return { valid: hmac === hash, data: params };
  } catch (e) {
    console.error('verifyTelegramInitData error:', e);
    return { valid: false };
  }
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
    console.error('Missing TELEGRAM_BOT_TOKEN in env');
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

  if (!initData) {
    console.warn('No initData provided');
    return res.status(200).json({
      ok: true,
      user: null,
      reason: 'No initData (guest mode)',
    });
  }

  const { valid, data } = verifyTelegramInitData(initData, botToken);
  if (!valid || !data) {
    console.warn('Invalid Telegram initData signature');
    return res.status(401).json({
      ok: false,
      user: null,
      reason: 'invalid signature',
    });
  }

  const userJson = data.get('user');
  if (!userJson) {
    console.warn('No user object inside initData');
    return res.status(200).json({
      ok: true,
      user: null,
      reason: 'No user data in initData',
    });
  }

  let parsed: {
    id: number | string;
    username?: string;
    first_name?: string;
    last_name?: string;
    photo_url?: string;
  };
  try {
    parsed = JSON.parse(userJson);
  } catch (e) {
    console.error('Failed to parse Telegram user JSON:', e);
    return res.status(400).json({
      ok: false,
      user: null,
      reason: 'Malformed user JSON in initData',
    });
  }

  const telegramId = String(parsed.id);
  const username = parsed.username as string | undefined;
  const firstName = parsed.first_name as string | undefined;
  const lastName = parsed.last_name as string | undefined;
  const photoUrl = parsed.photo_url as string | undefined;

  // Upsert user in the database
  const dbUser = await prisma.user.upsert({
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
  });

  return res.status(200).json({
    ok: true,
    user: {
      id: dbUser.id,
      username: dbUser.username ?? undefined,
      first_name: firstName ?? undefined,
      last_name: lastName ?? undefined,
      photo_url: photoUrl ?? undefined,
      points: dbUser.points,
      tier: dbUser.tier ?? undefined,
      credibilityScore: (dbUser.credibilityScore ?? 0).toString(),
      positiveReviews: dbUser.positiveReviews,
    },
    reason: 'Authenticated via Telegram WebApp',
  });
}
