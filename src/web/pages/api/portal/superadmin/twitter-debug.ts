/**
 * API Route: /api/portal/superadmin/twitter-debug
 *
 * POST: Fetch twitterapi.io tweet payload by tweet URL or ID (superadmin only)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSuperAdmin } from '@/lib/server/require-superadmin';
import { twitterApiGetTweetById } from '@/lib/twitterapi';

type Response =
  | { ok: true; tweetId: string; data: any }
  | { ok: false; error: string };

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

  const tweetId = extractTweetId(input);
  if (!tweetId) {
    return res.status(400).json({ ok: false, error: 'Invalid tweet URL or ID' });
  }

  const data = await twitterApiGetTweetById(tweetId);
  if (!data) {
    return res.status(404).json({ ok: false, error: 'Tweet not found via twitterapi.io' });
  }

  return res.status(200).json({ ok: true, tweetId, data });
}
