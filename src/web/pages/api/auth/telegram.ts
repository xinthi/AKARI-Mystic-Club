/**
 * Telegram Authentication API (Permissive Mode - Temporary)
 * 
 * TEMPORARY: This endpoint is permissive and does NOT verify signatures.
 * This is just to unblock development; we will secure it later.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

interface TelegramAuthResponse {
  ok: boolean;
  user?: {
    id?: number | string;
    username?: string;
    first_name?: string;
    last_name?: string;
    photo_url?: string;
    points?: number;
    tier?: string;
    credibilityScore?: string;
    positiveReviews?: number;
  } | null;
  reason?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TelegramAuthResponse>
) {
  // Accept both GET and POST for now
  if (req.method !== 'GET' && req.method !== 'POST') {
    console.warn('Auth endpoint: Method not strictly handled, but allowed (temporary)');
    return res.status(200).json({
      ok: true,
      user: null,
      reason: 'Method not strictly handled, but allowed (temporary)',
    });
  }

  // Try to get initData from various sources
  const initDataHeader =
    (req.headers['x-telegram-init-data'] as string | undefined) ||
    (typeof req.body === 'string'
      ? req.body
      : (req.body?.initData as string | undefined));

  // Try to parse Telegram initData, but NEVER fail hard
  let user: TelegramAuthResponse['user'] = null;

  if (initDataHeader) {
    try {
      const params = new URLSearchParams(initDataHeader);
      const userJson = params.get('user');
      if (userJson) {
        const parsed = JSON.parse(userJson);
        user = {
          id: parsed.id,
          username: parsed.username,
          first_name: parsed.first_name,
          last_name: parsed.last_name,
          photo_url: parsed.photo_url,
          points: 0,
          tier: undefined,
          credibilityScore: '0',
          positiveReviews: 0,
        };
        console.log('Parsed Telegram user from initData:', { id: user.id, username: user.username });
      } else {
        console.warn('No user parameter found in initData');
      }
    } catch (err) {
      console.error('Failed to parse Telegram initData:', err);
      console.warn('Raw initData received:', initDataHeader?.substring(0, 100));
    }
  } else {
    console.warn('No X-Telegram-Init-Data header or initData in body provided');
    console.log('Request headers:', Object.keys(req.headers));
    console.log('Request body type:', typeof req.body);
  }

  // TEMPORARY: do NOT verify HMAC/hash – always accept
  // This is just to unblock development; we will secure it later.
  return res.status(200).json({
    ok: true,
    user,
    reason: user 
      ? 'Accepted Telegram initData without signature check (dev mode)' 
      : 'No user data but allowed (dev mode)',
  });
}

