/**
 * Telegram Mini App Authentication Utilities
 *
 * Verifies Telegram init data and extracts user information
 * 
 * REQUIRED ENV VAR: TELEGRAM_BOT_TOKEN
 * - Must be set in Vercel (Production, Preview, Development)
 * - Get this token from @BotFather for your bot (e.g. @AKARIMystic_Bot)
 * - Do NOT commit the token to the repo
 */

import crypto from 'crypto';
import type { NextApiRequest } from 'next';
import type { PrismaClient } from '@prisma/client';

// Log env var status on module load (once per cold start)
console.log('[TelegramAuth] Module loaded. TELEGRAM_BOT_TOKEN length:', process.env.TELEGRAM_BOT_TOKEN?.length ?? 0);

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export interface TelegramAuthData {
  user: TelegramUser;
  auth_date: number;
  hash: string;
}

/**
 * Verify Telegram init data signature
 * @param initData - Raw init data string from Telegram WebApp
 * @param botToken - Telegram bot token
 * @returns true if signature is valid
 */
export function verifyTelegramWebAppData(initData: string, botToken: string): boolean {
  try {
    if (!initData || !botToken) {
      console.error('[TelegramAuth] Missing initData or botToken for verification');
      return false;
    }

    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');

    if (!hash) {
      console.error('[TelegramAuth] No hash field in initData');
      return false;
    }

    // Remove hash from params
    urlParams.delete('hash');

    // Sort and create data check string
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Create secret key: SHA256(botToken)
    const secretKey = crypto.createHash('sha256').update(botToken).digest();

    // Calculate hash
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      console.error('[TelegramAuth] Signature mismatch. initData length:', initData.length, 'botToken length:', botToken.length);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[TelegramAuth] Error verifying Telegram data:', error);
    return false;
  }
}

/**
 * Parse Telegram init data and extract user
 * @param initData - Raw init data string
 * @returns Parsed user data or null if invalid
 */
export function parseTelegramInitData(initData: string): TelegramAuthData | null {
  try {
    const urlParams = new URLSearchParams(initData);
    const userParam = urlParams.get('user');
    const authDate = urlParams.get('auth_date');
    const hash = urlParams.get('hash');

    if (!userParam || !authDate || !hash) {
      return null;
    }

    const user = JSON.parse(decodeURIComponent(userParam)) as TelegramUser;

    // Check auth date (should be within last 24 hours)
    const authTimestamp = parseInt(authDate, 10);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 24 * 60 * 60; // 24 hours

    if (now - authTimestamp > maxAge) {
      return null;
    }

    return {
      user,
      auth_date: authTimestamp,
      hash,
    };
  } catch (error) {
    console.error('Error parsing Telegram init data:', error);
    return null;
  }
}

/**
 * Get Telegram user from request (from init data or headers)
 * Returns the raw Telegram user object, not the DB user
 */
export function getTelegramUserFromRequest(req: NextApiRequest): TelegramUser | null {
  // Try to get from query params or header
  const initData = req.query?.initData || req.headers?.['x-telegram-init-data'];

  if (!initData || typeof initData !== 'string') {
    console.warn('[TelegramAuth] getTelegramUserFromRequest: No initData found in request');
    return null;
  }

  // Verify signature
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('[TelegramAuth] TELEGRAM_BOT_TOKEN env var not set!');
    return null;
  }

  if (!verifyTelegramWebAppData(initData, process.env.TELEGRAM_BOT_TOKEN)) {
    // Error already logged in verifyTelegramWebAppData
    return null;
  }

  const authData = parseTelegramInitData(initData);
  if (!authData?.user) {
    console.warn('[TelegramAuth] Failed to parse user from initData');
    return null;
  }

  return authData.user;
}

/**
 * Parse initData and return telegramId string (with full verification)
 */
function parseInitDataTelegramId(initData: string, botToken: string): string | null {
  try {
    if (!initData || !botToken) {
      console.error('[TelegramAuth] parseInitDataTelegramId: Missing initData or botToken');
      return null;
    }

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      console.error('[TelegramAuth] parseInitDataTelegramId: No hash in initData');
      return null;
    }

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

    if (hmac !== hash) {
      console.error('[TelegramAuth] parseInitDataTelegramId: HMAC mismatch. initData length:', initData.length);
      return null;
    }

    const userJson = params.get('user');
    if (!userJson) {
      console.error('[TelegramAuth] parseInitDataTelegramId: No user field in initData');
      return null;
    }

    const parsed = JSON.parse(userJson);
    return String(parsed.id);
  } catch (err) {
    console.error('[TelegramAuth] parseInitDataTelegramId error:', err);
    return null;
  }
}

/**
 * Get the current user from the request.
 * 
 * 1) First tries to authenticate via Telegram initData header
 * 2) Falls back to ADMIN_TELEGRAM_ID for MVP (so admin can always use the app) - DEV ONLY
 * 
 * @param req - Next.js API request
 * @param prisma - Prisma client instance
 * @returns User from database or null if not found/authenticated
 */
export async function getUserFromRequest(
  req: NextApiRequest,
  prisma: PrismaClient
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';

  if (!botToken) {
    console.error('[TelegramAuth] getUserFromRequest: TELEGRAM_BOT_TOKEN not set!');
  }

  // 1) Try to get telegramId from initData header
  const initDataHeader =
    (req.headers['x-telegram-init-data'] as string | undefined) ||
    (typeof req.body === 'string' ? req.body : (req.body?.initData as string | undefined));

  console.log('[TelegramAuth] getUserFromRequest: initData length:', initDataHeader?.length ?? 0);

  let telegramId: string | null = null;

  if (initDataHeader && botToken) {
    telegramId = parseInitDataTelegramId(initDataHeader, botToken);
    if (telegramId) {
      console.log('[TelegramAuth] getUserFromRequest: Verified telegramId:', telegramId);
    }
  }

  // If we got a telegramId from initData, look up the user
  if (telegramId) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });
    if (user) {
      console.log('[TelegramAuth] getUserFromRequest: Found user in DB:', user.id);
      return user;
    } else {
      console.log('[TelegramAuth] getUserFromRequest: No user found for telegramId:', telegramId);
    }
  }

  // 2) Fall back to ADMIN_TELEGRAM_ID (ONLY in development for local testing)
  // In production, we MUST have valid initData - no fallback allowed
  if (process.env.NODE_ENV !== 'production') {
    const adminTelegramId = process.env.ADMIN_TELEGRAM_ID;
    if (adminTelegramId) {
      console.log('[TelegramAuth] DEV MODE: Using ADMIN_TELEGRAM_ID fallback');
      // Look for existing user with that telegramId
      let user = await prisma.user.findFirst({
        where: { telegramId: adminTelegramId.toString() },
      });

      // If not found, create a basic user row for admin
      if (!user) {
        user = await prisma.user.create({
          data: {
            telegramId: adminTelegramId.toString(),
            username: 'MuazXinthi',
            firstName: 'Muaz',
          },
        });
      }

      return user;
    }
  }

  // No valid auth - return null
  console.warn('[TelegramAuth] getUserFromRequest: No valid auth - returning null');
  return null;
}
