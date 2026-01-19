/**
 * API Route: /api/portal/superadmin/twitter-debug
 *
 * POST: Fetch twitterapi.io tweet payload by tweet URL or ID (superadmin only)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSuperAdmin } from '@/lib/server/require-superadmin';
import { twitterApiGet } from '@/lib/twitterapi';

type Response =
  | { ok: true; tweetId: string; data: any }
  | { ok: false; error: string; attempts?: Array<{ path: string; params: any; error: string }> };

function extractTweetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const idMatch = trimmed.match(/status\/(\d+)/i);
  if (idMatch?.[1]) return idMatch[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const auth = await requireSuperAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const { input } = req.body || {};
  if (!input || typeof input !== 'string') {
    return res.status(400).json({ ok: false, error: 'input is required' });
  }

  const parsedTweetId = extractTweetId(input);
  if (!parsedTweetId) {
    return res.status(400).json({ ok: false, error: 'Invalid tweet URL or ID' });
  }
  const tweetId = parsedTweetId;

  const paramAttempts = [
    { tweetId },
    { tweet_id: tweetId },
    { id: tweetId },
  ];
  const endpointAttempts = [
    '/twitter/tweet/info',
    '/twitter/tweet/lookup',
    '/twitter/tweet',
  ];
  const attempts: Array<{ path: string; params: any; error: string }> = [];

  for (const path of endpointAttempts) {
    for (const params of paramAttempts) {
      try {
        const data = await twitterApiGet<any>(path, params);
        if (data) {
          return res.status(200).json({ ok: true, tweetId, data });
        }
      } catch (err: any) {
        attempts.push({
          path,
          params,
          error: err?.message || 'Unknown error',
        });
      }
    }
  }

  if (attempts.length > 0) {
    return res.status(404).json({ ok: false, error: 'Tweet not found via twitterapi.io', attempts });
  }

  return res.status(404).json({ ok: false, error: 'Tweet not found via twitterapi.io' });

  return res.status(200).json({ ok: true, tweetId, data });
}
