/**
 * API Route: GET /api/portal/sentiment/search
 * 
 * Searches for Twitter users/profiles.
 * Query params:
 *   - q: Search query string
 *   - limit: Maximum results (default 10)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { searchUsers } from '@/lib/rapidapi/twitter';
import type { TwitterUserProfile } from '@/lib/rapidapi/twitter';

type SearchResponse =
  | {
      ok: true;
      users: TwitterUserProfile[];
    }
  | {
      ok: false;
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SearchResponse>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  const { q, limit } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length < 2) {
    return res.status(400).json({
      ok: false,
      error: 'Search query must be at least 2 characters',
    });
  }

  const maxResults = Math.min(Number(limit) || 10, 20);

  try {
    const users = await searchUsers(q.trim(), maxResults);

    return res.status(200).json({
      ok: true,
      users,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[API /portal/sentiment/search] Error:', err.message);

    return res.status(500).json({
      ok: false,
      error: 'Failed to search users',
    });
  }
}
