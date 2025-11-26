/**
 * X (Twitter) OAuth 2.0 Start
 *
 * Initiates the OAuth flow by redirecting to X's authorize URL
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

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
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const clientId = process.env.TWITTER_CLIENT_ID;

  if (!botToken || !clientId) {
    return res.status(500).json({ ok: false, reason: 'Server misconfigured' });
  }

  // Authenticate via initData - support both header and query parameter
  // Query param is needed because window.open() doesn't send custom headers
  const headerInitData =
    (req.headers['x-telegram-init-data'] as string) ||
    (req.headers['X-Telegram-Init-Data'] as string) ||
    '';
  const queryInitData = (req.query.initData as string) || '';
  const initData = headerInitData || queryInitData;

  const telegramId = verifyAndParseInitData(initData, botToken);

  if (!telegramId) {
    return res.status(401).json({ ok: false, reason: 'Unauthorized' });
  }

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

