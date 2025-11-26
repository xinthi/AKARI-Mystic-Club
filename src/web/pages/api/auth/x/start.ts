/**
 * X (Twitter) OAuth 2.0 Start
 *
 * Initiates the OAuth flow by redirecting to X's authorize URL
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { verifyTelegramWebAppData, parseTelegramInitData } from '../../../../lib/telegram-auth';

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
  const headerInitData = (req.headers['x-telegram-init-data'] as string) || '';

  const initData = queryInitData || headerInitData;

  // Debug logging - which source provided initData
  console.log('[X OAuth] initData sources:');
  console.log('[X OAuth]   - query param length:', queryInitData.length);
  console.log('[X OAuth]   - header length:', headerInitData.length);
  console.log('[X OAuth]   - using initData length:', initData.length);

  // Check if initData is present
  if (!initData || initData.trim() === '') {
    console.error('[X OAuth] Missing initData - empty string received');
    return res.status(401).json({ ok: false, reason: 'Unauthorized' });
  }

  // Verify signature using shared helper
  if (!verifyTelegramWebAppData(initData, botToken)) {
    console.error('[X OAuth] initData signature verification failed');
    return res.status(401).json({ ok: false, reason: 'Unauthorized' });
  }

  // Parse the initData to get user info
  const authData = parseTelegramInitData(initData);
  if (!authData || !authData.user) {
    console.error('[X OAuth] Failed to parse initData user');
    return res.status(401).json({ ok: false, reason: 'Unauthorized' });
  }

  const telegramId = String(authData.user.id);
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

