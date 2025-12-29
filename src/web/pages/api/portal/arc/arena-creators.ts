/**
 * API Route: GET /api/portal/arc/arena-creators
 * 
 * Returns a list of creators for a given arena.
 * Query param: arenaId (UUID, required)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';

// =============================================================================
// TYPES
// =============================================================================

interface Creator {
  id: string;
  arena_id: string;
  profile_id: string;
  username: string | null;
  twitter_username: string | null;
  avatar_url: string | null;
  arc_points: number;
  ring: 'core' | 'momentum' | 'discovery';
  style: string | null;
  joined_at: string;
}

type ArenaCreatorsResponse =
  | {
      ok: true;
      creators: Creator[];
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
  res: NextApiResponse<ArenaCreatorsResponse>
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
    const supabaseAdmin = getSupabaseAdmin();

    // Extract query parameter
    const { arenaId } = req.query;

    // Validate arenaId is provided
    if (!arenaId || typeof arenaId !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'arenaId is required',
      });
    }

    // Fetch arena to get project_id for access check
    const { data: arena, error: arenaError } = await supabase
      .from('arenas')
      .select('id, project_id')
      .eq('id', arenaId)
      .single();

    if (arenaError || !arena) {
      return res.status(404).json({
        ok: false,
        error: 'Arena not found',
      });
    }

    if (!arena.project_id) {
      return res.status(400).json({
        ok: false,
        error: 'Arena missing project_id',
      });
    }

    // Check ARC access (Option 2 = Leaderboard) - creator data is project-specific ARC data
    const accessCheck = await requireArcAccess(supabaseAdmin, arena.project_id, 2);
    if (!accessCheck.ok) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error,
      });
    }

    // Query arena_creators
    const { data, error } = await supabase
      .from('arena_creators')
      .select('id, arena_id, profile_id, twitter_username, arc_points, ring, style, created_at')
      .eq('arena_id', arenaId)
      .order('arc_points', { ascending: false });

    if (error) {
      console.error('arena-creators error', error);
      return res.status(500).json({
        ok: false,
        error: error.message ?? 'Internal server error',
      });
    }

    // Map data to response format (only safe fields needed by UI)
    const creators = (data ?? []).map((row) => ({
      id: row.id,
      arena_id: row.arena_id,
      profile_id: row.profile_id, // Needed for UI operations
      username: null,
      twitter_username: row.twitter_username,
      avatar_url: null,
      arc_points: row.arc_points,
      ring: row.ring,
      style: row.style,
      joined_at: row.created_at,
    }));

    return res.status(200).json({
      ok: true,
      creators,
    });
  } catch (error: any) {
    console.error('[API /portal/arc/arena-creators] Error:', error);
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
}
