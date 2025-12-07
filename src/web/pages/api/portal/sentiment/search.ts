/**
 * API Route: GET /api/portal/sentiment/search
 * 
 * Searches for Twitter users/profiles using the unified Twitter client.
 * Supports provider switching via TWITTER_PRIMARY_PROVIDER env var.
 * 
 * Query params:
 *   - q: Search query string (required, min 2 chars)
 *   - limit: Maximum results (default 10, max 20)
 * 
 * Returns normalized user data with profile images.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { searchUsers, TwitterUserProfile } from '@/lib/twitter/twitter';

/**
 * Normalized search result user
 */
interface SearchResultUser {
  id: string;
  username: string;
  name: string;
  profileImageUrl: string | null;
  bio: string | null;
  followersCount: number;
  followingCount: number;
  verified: boolean;
}

type SearchResponse =
  | {
      ok: true;
      users: SearchResultUser[];
      provider?: string; // For debugging
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Normalize a TwitterUserProfile to SearchResultUser
 */
function normalizeUser(user: TwitterUserProfile): SearchResultUser {
  return {
    id: user.userId || user.handle,
    username: user.handle,
    name: user.name || user.handle,
    profileImageUrl: user.profileImageUrl || user.avatarUrl || null,
    bio: user.bio || null,
    followersCount: user.followersCount || 0,
    followingCount: user.followingCount || 0,
    verified: user.verified || false,
  };
}

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

  // Support both 'q' and 'query' params
  const q = (req.query.q || req.query.query || '').toString().trim();

  if (!q || q.length < 2) {
    return res.status(400).json({
      ok: false,
      error: 'Search query must be at least 2 characters',
    });
  }

  const maxResults = Math.min(Number(req.query.limit) || 10, 20);

  console.log(`[API /portal/sentiment/search] Searching for: "${q}" (limit: ${maxResults})`);

  try {
    const rawUsers = await searchUsers(q, maxResults);
    
    // Normalize all users to consistent format
    const users = rawUsers.map(normalizeUser);

    console.log(`[API /portal/sentiment/search] Found ${users.length} users for query: "${q}"`);

    return res.status(200).json({
      ok: true,
      users,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[API /portal/sentiment/search] Error:', err.message, err.stack);

    // Return empty result instead of error for better UX
    return res.status(200).json({
      ok: true,
      users: [],
    });
  }
}
