/**
 * API Route: GET /api/portal/arc/arena-details
 * 
 * Returns detailed arena data by arenaId.
 * Query param: arenaId (UUID)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface ArenaDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';
  starts_at: string | null;
  ends_at: string | null;
  reward_depth: number;
  settings: Record<string, any>;
}

interface Creator {
  id: string;
  twitter_username: string;
  arc_points: number;
  ring: 'core' | 'momentum' | 'discovery';
  style: string | null;
  meta: Record<string, any>;
}

type ArenaDetailResponse =
  | {
      ok: true;
      arena: ArenaDetail;
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
  res: NextApiResponse<ArenaDetailResponse>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  const { arenaId } = req.query;

  if (!arenaId || typeof arenaId !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'arenaId query parameter is required',
    });
  }

  try {
    // Create Supabase client (read-only with anon key)
    const supabase = createPortalClient();

    // Look up arena by id
    const { data: arenaData, error: arenaError } = await supabase
      .from('arenas')
      .select(`
        id,
        slug,
        name,
        description,
        status,
        starts_at,
        ends_at,
        reward_depth,
        settings
      `)
      .eq('id', arenaId)
      .single();

    if (arenaError) {
      // Check if it's a "not found" error (PGRST116 is the code for no rows)
      if (arenaError.code === 'PGRST116') {
        return res.status(404).json({
          ok: false,
          error: 'Arena not found',
        });
      }

      console.error('[API /portal/arc/arena-details] Supabase error fetching arena:', arenaError);
      return res.status(500).json({
        ok: false,
        error: 'Internal server error',
      });
    }

    if (!arenaData) {
      return res.status(404).json({
        ok: false,
        error: 'Arena not found',
      });
    }

    // Query arena_creators for this arena, ordered by arc_points DESC
    const { data: creatorsData, error: creatorsError } = await supabase
      .from('arena_creators')
      .select('id, twitter_username, arc_points, ring, style, meta')
      .eq('arena_id', arenaData.id)
      .order('arc_points', { ascending: false });

    if (creatorsError) {
      console.error('[API /portal/arc/arena-details] Supabase error fetching creators:', creatorsError);
      // Don't fail the request if creators can't be fetched, just return empty array
    }

    // Build response
    const response: ArenaDetailResponse = {
      ok: true,
      arena: {
        id: arenaData.id,
        slug: arenaData.slug,
        name: arenaData.name,
        description: arenaData.description,
        status: arenaData.status,
        starts_at: arenaData.starts_at,
        ends_at: arenaData.ends_at,
        reward_depth: arenaData.reward_depth,
        settings: arenaData.settings || {},
      },
      creators: (creatorsData || []).map((creator: any) => ({
        id: creator.id,
        twitter_username: creator.twitter_username,
        arc_points: Number(creator.arc_points),
        ring: creator.ring,
        style: creator.style,
        meta: creator.meta || {},
      })),
    };

    return res.status(200).json(response);
  } catch (error: any) {
    console.error('[API /portal/arc/arena-details] Error:', error);
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
}
