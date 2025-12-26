/**
 * API Route: GET /api/portal/arc/arenas/[slug]/leaderboard
 * 
 * Paginated leaderboard for an arena
 * Fetches from project_tweets/sentiment with follow multiplier
 * Supports pagination (100 per page)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { requirePortalUser } from '@/lib/server/require-portal-user';

interface LeaderboardEntry {
  rank: number;
  twitter_username: string;
  avatar_url: string | null;
  base_points: number;
  multiplier: number;
  score: number;
  is_joined: boolean;
  follow_verified: boolean;
  ring: 'core' | 'momentum' | 'discovery' | null;
  joined_at: string | null;
}

type LeaderboardResponse =
  | { 
      ok: true; 
      entries: LeaderboardEntry[]; 
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }
  | { ok: false; error: string };

function normalizeTwitterUsername(username: string | null | undefined): string {
  if (!username) return '';
  return username.toLowerCase().replace(/^@/, '').trim();
}

/**
 * Calculate points from project_tweets (mentions only)
 * Points = sum of engagement (likes + replies*2 + retweets*3) for mentions
 */
async function calculateAutoTrackedPoints(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  projectId: string
): Promise<Map<string, { basePoints: number; tweetCount: number }>> {
  // Get all mentions (non-official tweets) for this project
  const { data: mentions, error } = await supabase
    .from('project_tweets')
    .select('author_handle, likes, replies, retweets')
    .eq('project_id', projectId)
    .eq('is_official', false); // Only mentions, not official project tweets

  if (error || !mentions) {
    console.error('[ARC Leaderboard] Error fetching mentions:', error);
    return new Map();
  }

  // Aggregate points by normalized username
  const pointsMap = new Map<string, { basePoints: number; tweetCount: number }>();
  for (const mention of mentions) {
    const normalizedUsername = normalizeTwitterUsername(mention.author_handle);
    if (!normalizedUsername) continue;

    // Calculate engagement points: likes + replies*2 + retweets*3
    const engagement = (mention.likes || 0) + (mention.replies || 0) * 2 + (mention.retweets || 0) * 3;
    const current = pointsMap.get(normalizedUsername) || { basePoints: 0, tweetCount: 0 };
    pointsMap.set(normalizedUsername, {
      basePoints: current.basePoints + engagement,
      tweetCount: current.tweetCount + 1,
    });
  }

  return pointsMap;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LeaderboardResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const portalUser = await requirePortalUser(req, res);
    if (!portalUser) {
      return;
    }

    const supabase = getSupabaseAdmin();
    const { slug, page = '1' } = req.query;

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ ok: false, error: 'Arena slug is required' });
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const pageSize = 100;

    // Find arena by slug
    const { data: arenaData, error: arenaError } = await supabase
      .from('arenas')
      .select('id, project_id, name, slug')
      .ilike('slug', slug.trim().toLowerCase())
      .single();

    if (arenaError || !arenaData) {
      return res.status(404).json({ ok: false, error: 'Arena not found' });
    }

    // Check ARC access
    const accessCheck = await requireArcAccess(supabase, arenaData.project_id, 2);
    if (!accessCheck.ok) {
      return res.status(403).json({ ok: false, error: accessCheck.error });
    }

    // Calculate auto-tracked points from project_tweets
    const autoTrackedPoints = await calculateAutoTrackedPoints(supabase, arenaData.project_id);

    // Get joined creators (for multiplier and ring info)
    const { data: creators, error: creatorsError } = await supabase
      .from('arena_creators')
      .select('profile_id, twitter_username, ring, created_at, profiles:profile_id (username, profile_image_url)')
      .eq('arena_id', arenaData.id);

    if (creatorsError) {
      console.error('[ARC Leaderboard] Error fetching creators:', creatorsError);
    }

    // Get follow verification status for joined creators
    const joinedUsernames = new Set<string>();
    const joinedMap = new Map<string, {
      profile_id: string | null;
      ring: string | null;
      joined_at: string | null;
      follow_verified: boolean;
    }>();

    if (creators) {
      for (const creator of creators) {
        const normalizedUsername = normalizeTwitterUsername(creator.twitter_username);
        if (normalizedUsername) {
          joinedUsernames.add(normalizedUsername);
          // Check if creator follows the project (simplified - you may need to check actual follow status)
          // For now, assume follow_verified = true if they joined
          joinedMap.set(normalizedUsername, {
            profile_id: creator.profile_id || null,
            ring: creator.ring as string | null,
            joined_at: creator.created_at || null,
            follow_verified: true, // TODO: Check actual follow status
          });
        }
      }
    }

    // Build leaderboard entries from auto-tracked points
    const entries: LeaderboardEntry[] = [];
    const profileMap = new Map<string, { avatar_url: string | null }>();

    // Get profile images for all creators
    const allUsernames = Array.from(autoTrackedPoints.keys());
    if (allUsernames.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('username, profile_image_url')
        .in('username', allUsernames);

      if (profiles) {
        for (const profile of profiles) {
          const normalized = normalizeTwitterUsername(profile.username);
          if (normalized) {
            profileMap.set(normalized, { avatar_url: profile.profile_image_url || null });
          }
        }
      }
    }

    // Build entries with multipliers
    for (const [username, data] of autoTrackedPoints.entries()) {
      const joined = joinedMap.get(username);
      const isJoined = !!joined;
      const followVerified = joined?.follow_verified || false;
      
      // Multiplier: 1.5x if joined AND follow verified, else 1.0x
      const multiplier = (isJoined && followVerified) ? 1.5 : 1.0;
      const score = data.basePoints * multiplier;

      const profile = profileMap.get(username);

      entries.push({
        rank: 0, // Will be set after sorting
        twitter_username: `@${username}`,
        avatar_url: profile?.avatar_url || null,
        base_points: data.basePoints,
        multiplier,
        score,
        is_joined: isJoined,
        follow_verified,
        ring: joined?.ring as 'core' | 'momentum' | 'discovery' | null,
        joined_at: joined?.joined_at || null,
      });
    }

    // Sort by score DESC
    entries.sort((a, b) => b.score - a.score);

    // Set ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    // Pagination
    const total = entries.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (pageNum - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedEntries = entries.slice(startIndex, endIndex);

    return res.status(200).json({
      ok: true,
      entries: paginatedEntries,
      total,
      page: pageNum,
      pageSize,
      totalPages,
    });
  } catch (error: any) {
    console.error('[ARC Arena Leaderboard API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

