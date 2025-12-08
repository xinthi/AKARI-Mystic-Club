/**
 * Website X (Twitter) OAuth 2.0 Start
 *
 * Initiates the OAuth flow for WEBSITE login (not MiniApp).
 * This creates a session cookie for the website.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[Website X OAuth] Start request received');

  const clientId = process.env.TWITTER_CLIENT_ID;

  if (!clientId) {
    console.error('[Website X OAuth] Missing TWITTER_CLIENT_ID');
    return res.status(500).json({ ok: false, error: 'Server misconfigured' });
  }

  // Build OAuth 2.0 authorize URL with PKCE
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.host}`;
  const redirectUri = `${baseUrl}/api/auth/website/x/callback`;
  
  // Generate code verifier and challenge for PKCE
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // State includes code verifier and timestamp
  const stateData = JSON.stringify({
    codeVerifier,
    timestamp: Date.now(),
    type: 'website_login', // Mark this as website login
  });
  const state = Buffer.from(stateData).toString('base64url');

  // Scopes needed for website login
  const scopes = ['tweet.read', 'users.read', 'offline.access'];

  const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  console.log('[Website X OAuth] Redirecting to X authorize URL');
  
  // Redirect to X OAuth
  return res.redirect(302, authUrl.toString());
}

