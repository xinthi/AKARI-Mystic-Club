/**
 * X (Twitter) OAuth 2.0 Start
 *
 * Initiates the OAuth flow by redirecting to X's authorize URL
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

/**
 * Parse and verify Telegram initData, return parsed user data or null
 */
function verifyAndParseInitData(
  initData: string,
  botToken: string
): { telegramId: string; user: any } | null {
  // Check if initData exists
  if (!initData || initData.trim() === '') {
    console.error('[X OAuth] Missing initData - empty string received');
    return null;
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
      console.error('[X OAuth] initData invalid: no hash field found');
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
      console.error('[X OAuth] initData signature failed - HMAC mismatch');
      console.error('[X OAuth] Expected hash:', hash.substring(0, 16) + '...');
      console.error('[X OAuth] Computed hash:', hmac.substring(0, 16) + '...');
      return null;
    }

    const userJson = params.get('user');
    if (!userJson) {
      console.error('[X OAuth] initData invalid: no user field found');
      return null;
    }

    const parsed = JSON.parse(userJson);
    const telegramId = String(parsed.id);

    console.log('[X OAuth] initData parsed for user:', telegramId);

    return { telegramId, user: parsed };
  } catch (err) {
    console.error('[X OAuth] initData parse error:', err);
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[X OAuth] Request received');

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const clientId = process.env.TWITTER_CLIENT_ID;

  if (!botToken || !clientId) {
    console.error('[X OAuth] Server misconfigured - missing TELEGRAM_BOT_TOKEN or TWITTER_CLIENT_ID');
    return res.status(500).json({ ok: false, reason: 'Server misconfigured' });
  }

  // Authenticate via initData - support both query and header
  // Query param is needed because window.open() doesn't send custom headers
  const queryInitData = (req.query.initData as string) || '';
  const headerInitData =
    (req.headers['x-telegram-init-data'] as string) ||
    (req.headers['X-Telegram-Init-Data'] as string) ||
    '';

  const initData = queryInitData || headerInitData;

  // Debug logging - which source provided initData
  console.log('[X OAuth] initData sources:');
  console.log('[X OAuth]   - query param length:', queryInitData.length);
  console.log('[X OAuth]   - header length:', headerInitData.length);
  console.log('[X OAuth]   - using initData length:', initData.length);

  // Parse and verify initData
  let parsed: { telegramId: string; user: any } | null = null;

  try {
    parsed = verifyAndParseInitData(initData, botToken);

    if (!parsed) {
      console.error('[X OAuth] initData verification returned null');
      return res.status(401).json({ ok: false, reason: 'Unauthorized' });
    }
  } catch (err) {
    console.error('[X OAuth] initData parse exception:', err);
    return res.status(401).json({ ok: false, reason: 'Unauthorized' });
  }

  const { telegramId } = parsed;
  console.log('[X OAuth] Proceeding with OAuth for telegramId:', telegramId);

  // Build OAuth 2.0 authorize URL
  // X OAuth 2.0 with PKCE
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000'}/api/auth/x/callback`;
  
  // Generate code verifier and challenge for PKCE
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // State includes telegramId and code verifier (encoded)
  const stateData = JSON.stringify({
    telegramId,
    codeVerifier,
    timestamp: Date.now(),
  });
  const state = Buffer.from(stateData).toString('base64url');

  const scopes = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

  const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // Redirect to X OAuth
  return res.redirect(302, authUrl.toString());
}

