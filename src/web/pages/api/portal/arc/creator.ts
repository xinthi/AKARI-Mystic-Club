/**
 * API Route: GET /api/portal/arc/creator
 * 
 * Returns creator profile data across all arenas.
 * Query param: twitterUsername (required, case-insensitive)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient, fetchProfileImagesForHandles } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface CreatorProfile {
  twitter_username: string;
  primary_ring: string | null;
  primary_style: string | null;
  total_points: number;
  arenas_count: number;
  ring_points: {
    core: number;
    momentum: number;
    discovery: number;
  };
  avatar_url: string | null;
}

interface CreatorArenaEntry {
  arena_id: string;
  arena_name: string;
  arena_slug: string;
  project_id: string;
  project_name: string;
  project_slug: string | null;
  project_twitter_username: string | null;
  ring: string | null;
  arc_points: number;
  style: string | null;
  joined_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

type CreatorResponse =
  | {
      ok: true;
      creator: CreatorProfile;
      arenas: CreatorArenaEntry[];
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreatorResponse>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  try {
    // Create Supabase client (read-only with anon key)
    const supabase = createPortalClient();

    // Extract query parameter
    const { twitterUsername } = req.query;

    // Validate twitterUsername is provided
    if (!twitterUsername || typeof twitterUsername !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'twitterUsername is required',
      });
    }

    // Normalize username for case-insensitive comparison
    const normalizedUsername = twitterUsername.toLowerCase().trim();

    // Query arena_creators with joins to arenas and projects
    const { data: creatorsData, error: creatorsError } = await supabase
      .from('arena_creators')
      .select(`
        id,
        twitter_username,
        arc_points,
        ring,
        style,
        created_at,
        arena_id,
        arenas!inner (
          id,
          name,
          slug,
          starts_at,
          ends_at,
          project_id,
          projects!inner (
            id,
            name,
            slug,
            x_handle
          )
        )
      `)
      .ilike('twitter_username', normalizedUsername);

    if (creatorsError) {
      console.error('[API /portal/arc/creator] Supabase error:', creatorsError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch creator data',
      });
    }

    if (!creatorsData || creatorsData.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'CREATOR_NOT_FOUND',
      });
    }

    // Process the data
    const arenas: CreatorArenaEntry[] = [];
    let totalPoints = 0;
    type RingKey = 'core' | 'momentum' | 'discovery';

    const ringPoints: Record<RingKey, number> = {
      core: 0,
      momentum: 0,
      discovery: 0,
    };
    let primaryRing: string | null = null;
    let primaryStyle: string | null = null;
    let maxPoints = -1;

    for (const row of creatorsData) {
      const arena = (row as any).arenas;
      const project = arena?.projects;

      if (!arena || !project) continue;

      const points = Number(row.arc_points) || 0;
      totalPoints += points;

      // Track ring points
      const rawRing = row.ring;

      if (typeof rawRing === 'string') {
        const lower = rawRing.toLowerCase();

        if (lower === 'core' || lower === 'momentum' || lower === 'discovery') {
          const key = lower as RingKey;
          ringPoints[key] += points;
        }
      }

      // Track primary ring and style from highest points arena
      if (points > maxPoints) {
        maxPoints = points;
        primaryRing = row.ring || null;
        primaryStyle = row.style || null;
      }

      arenas.push({
        arena_id: row.arena_id,
        arena_name: arena.name,
        arena_slug: arena.slug,
        project_id: arena.project_id,
        project_name: project.name,
        project_slug: project.slug || null,
        project_twitter_username: project.x_handle || null,
        ring: row.ring || null,
        arc_points: points,
        style: row.style || null,
        joined_at: row.created_at || null,
        starts_at: arena.starts_at || null,
        ends_at: arena.ends_at || null,
      });
    }

    // Get unique arena count
    const uniqueArenas = new Set(arenas.map(a => a.arena_id));
    const arenasCount = uniqueArenas.size;

    // Get the actual twitter_username from the first row (should be consistent)
    const twitterUsernameActual = creatorsData[0]?.twitter_username || normalizedUsername;

    // Fetch profile image for this creator
    let avatar_url: string | null = null;
    try {
      const cleanUsername = twitterUsernameActual.replace(/^@+/, '').toLowerCase();
      const { profilesMap, akariUsersMap } = await fetchProfileImagesForHandles(supabase, [cleanUsername]);
      // akariUsersMap takes precedence if both exist
      avatar_url = akariUsersMap.get(cleanUsername) || profilesMap.get(cleanUsername) || null;
    } catch (error) {
      console.error('[API /portal/arc/creator] Error fetching profile image:', error);
      // Continue without avatar
    }

    // Build response
    const response: CreatorResponse = {
      ok: true,
      creator: {
        twitter_username: twitterUsernameActual,
        primary_ring: primaryRing,
        primary_style: primaryStyle,
        total_points: totalPoints,
        arenas_count: arenasCount,
        ring_points: ringPoints,
        avatar_url: avatar_url,
      },
      arenas: arenas.sort((a, b) => b.arc_points - a.arc_points), // Sort by points descending
    };

    return res.status(200).json(response);
  } catch (error: any) {
    console.error('[API /portal/arc/creator] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
