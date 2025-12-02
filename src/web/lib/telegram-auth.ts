/**
 * Telegram Mini App Authentication Utilities
 *
 * Verifies Telegram init data and extracts user information
 * 
 * REQUIRED ENV VAR: TELEGRAM_BOT_TOKEN
 * - Must be set in Vercel (Production, Preview, Development)
 * - Get this token from @BotFather for your bot (e.g. @AKARIMystic_Bot)
 * - Do NOT commit the token to the repo
 * 
 * Verification algorithm follows:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

import crypto from 'crypto';
import type { NextApiRequest } from 'next';
import type { PrismaClient } from '@prisma/client';
import { withDbRetry } from './prisma';

// Log env var status on module load (once per cold start)
const _botToken = process.env.TELEGRAM_BOT_TOKEN || '';
const _maskedToken = _botToken.length >= 14
  ? `${_botToken.slice(0, 8)}...${_botToken.slice(-6)}`
  : '(too short or missing)';
console.log('[TelegramAuth] Module loaded. TELEGRAM_BOT_TOKEN length:', _botToken.length);
console.log('[TelegramAuth] Using TELEGRAM_BOT_TOKEN:', _maskedToken);

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
 * Verify Telegram WebApp initData signature
 * 
 * CRITICAL: This uses the WEBAPP algorithm (not Login Widget):
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * 
 * 1. Parse initData with URLSearchParams
 * 2. Extract and remove the 'hash' field
 * 3. Build data_check_string from sorted key=value pairs joined by '\n'
 * 4. Compute secret = HMAC-SHA256("WebAppData", botToken)  <-- THIS IS THE KEY DIFFERENCE
 * 5. Compute hash = HMAC-SHA256(secret, data_check_string)
 * 6. Compare with provided hash using timing-safe comparison
 * 
 * @param initData - Raw init data string from Telegram WebApp
 * @param botToken - Telegram bot token from BotFather
 * @returns true if signature is valid
 */
export function verifyTelegramWebAppData(initData: string, botToken: string): boolean {
  if (!initData || !botToken) {
    console.error('[TelegramAuth] verifyTelegramWebAppData: Missing initData or botToken');
    return false;
  }

  // Parse initData with URLSearchParams
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');

  if (!hash) {
    console.error('[TelegramAuth] verifyTelegramWebAppData: no hash in initData');
    return false;
  }

  // Remove hash from params before building check string
  params.delete('hash');

  // Build data_check_string: key=value pairs sorted alphabetically, joined by \n
  const entries: string[] = [];
  params.forEach((value, key) => {
    entries.push(`${key}=${value}`);
  });
  entries.sort();
  const dataCheckString = entries.join('\n');

  // WEBAPP ALGORITHM: secret = HMAC-SHA256("WebAppData", botToken)
  // This is DIFFERENT from Login Widget which uses SHA256(botToken)
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  // Compute hash = HMAC-SHA256(secret, data_check_string)
  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Debug logging
  console.log('[TelegramAuth] verifyTelegramWebAppData: signature check', {
    initDataLength: initData.length,
    hasHash: !!hash,
    checkStringLength: dataCheckString.length,
    computedHashPrefix: computedHash.slice(0, 8),
    providedHashPrefix: hash.slice(0, 8),
    entriesCount: entries.length,
  });

  // Use timing-safe comparison to prevent timing attacks
  try {
    const ok = crypto.timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(hash, 'hex')
    );

    if (ok) {
      // Extract user ID for success logging
      let userId = 'unknown';
      try {
        const userParam = params.get('user');
        if (userParam) {
          const parsed = JSON.parse(userParam);
          userId = String(parsed.id);
        }
      } catch {
        // ignore parse errors
      }
      console.log('[TelegramAuth] verifyTelegramWebAppData: OK', {
        initDataLength: initData.length,
        checkStringLength: dataCheckString.length,
        entriesCount: entries.length,
        userId,
      });
    }

    return ok;
  } catch (e) {
    console.error('[TelegramAuth] verifyTelegramWebAppData: timingSafeEqual error', e);
    return false;
  }
}

/**
 * Parse Telegram init data and extract user
 * Uses split('&') approach to match verification logic
 * @param initData - Raw init data string
 * @returns Parsed user data or null if invalid
 */
export function parseTelegramInitData(initData: string): TelegramAuthData | null {
  try {
    // Parse by splitting on '&' to be consistent with verification
    const pairs = initData.split('&');
    
    let userParam = '';
    let authDate = '';
    let hash = '';
    
    for (const pair of pairs) {
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) continue;
      
      const key = pair.substring(0, eqIndex);
      const value = pair.substring(eqIndex + 1);
      
      if (key === 'user') userParam = value;
      else if (key === 'auth_date') authDate = value;
      else if (key === 'hash') hash = value;
    }

    if (!userParam || !authDate || !hash) {
      console.warn('[TelegramAuth] parseTelegramInitData: Missing required fields');
      return null;
    }

    const user = JSON.parse(decodeURIComponent(userParam)) as TelegramUser;

    // Check auth date (should be within last 24 hours)
    const authTimestamp = parseInt(authDate, 10);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 24 * 60 * 60; // 24 hours

    if (now - authTimestamp > maxAge) {
      console.warn('[TelegramAuth] parseTelegramInitData: auth_date too old');
      return null;
    }

    return {
      user,
      auth_date: authTimestamp,
      hash,
    };
  } catch (error) {
    console.error('[TelegramAuth] parseTelegramInitData error:', error);
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
 * Verify initData and return telegramId string
 * Uses the shared verifyTelegramWebAppData function - no duplicate HMAC logic
 */
function parseInitDataTelegramId(initData: string, botToken: string): string | null {
  try {
    if (!initData || !botToken) {
      console.error('[TelegramAuth] parseInitDataTelegramId: Missing initData or botToken');
      return null;
    }

    // Use the shared verification function
    if (!verifyTelegramWebAppData(initData, botToken)) {
      // Error already logged in verifyTelegramWebAppData
      return null;
    }

    // Extract user from initData (already verified)
    // Parse by splitting on & to match the verification logic
    const pairs = initData.split('&');
    for (const pair of pairs) {
      if (pair.startsWith('user=')) {
        const userJson = decodeURIComponent(pair.substring(5));
        const parsed = JSON.parse(userJson);
        return String(parsed.id);
      }
    }

    console.error('[TelegramAuth] parseInitDataTelegramId: No user field in initData');
    return null;
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
    try {
      const user = await withDbRetry(() => prisma.user.findUnique({
        where: { telegramId },
      }), 2, 500); // Fast retry for auth
      if (user) {
        console.log('[TelegramAuth] getUserFromRequest: Found user in DB:', user.id);
        return user;
      } else {
        console.log('[TelegramAuth] getUserFromRequest: No user found for telegramId:', telegramId);
      }
    } catch (dbErr: any) {
      console.error('[TelegramAuth] getUserFromRequest: Database error:', dbErr.message);
      // Don't throw - return null so caller can handle gracefully
      return null;
    }
  }

  // 2) Fall back to ADMIN_TELEGRAM_ID (ONLY in development for local testing)
  // In production, we MUST have valid initData - no fallback allowed
  if (process.env.NODE_ENV !== 'production') {
    const adminTelegramId = process.env.ADMIN_TELEGRAM_ID;
    if (adminTelegramId) {
      console.log('[TelegramAuth] DEV MODE: Using ADMIN_TELEGRAM_ID fallback');
      try {
        // Look for existing user with that telegramId
        let user = await withDbRetry(() => prisma.user.findFirst({
          where: { telegramId: adminTelegramId.toString() },
        }), 2, 500);

        // If not found, create a basic user row for admin
        if (!user) {
          user = await withDbRetry(() => prisma.user.create({
            data: {
              telegramId: adminTelegramId.toString(),
              username: 'MuazXinthi',
              firstName: 'Muaz',
            },
          }), 2, 500);
        }

        return user;
      } catch (dbErr: any) {
        console.error('[TelegramAuth] DEV MODE: Database error:', dbErr.message);
        return null;
      }
    }
  }

  // No valid auth - return null
  console.warn('[TelegramAuth] getUserFromRequest: No valid auth - returning null');
  return null;
}
