/**
 * API Route: GET /api/portal/arc/admin/arena-creators
 * 
 * Returns arena creators for a given arenaId.
 * Includes effective points calculation (base + adjustments).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface Creator {
  profile_id: string | null;
  twitter_username: string;
  base_points: number; // arena_creators.arc_points
  adjustments_sum: number; // SUM(arc_point_adjustments.points_delta)
  effective_points: number; // base_points + COALESCE(adjustments_sum, 0)
  ring: 'core' | 'momentum' | 'discovery';
  style: string | null;
  meta: Record<string, any>;
  joined_at: string | null;
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
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing Supabase URL configuration');
  }

  if (!supabaseServiceKey) {
    throw new Error('Missing Supabase service role key');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

async function checkSuperAdmin(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<boolean> {
  const { data: roles } = await supabase
    .from('akari_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');

  return (roles?.length ?? 0) > 0;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ArenaCreatorsResponse>
) {
  const DEV_MODE = process.env.NODE_ENV === 'development';

  try {
    const supabase = getSupabaseAdmin();

    // ==========================================================================
    // AUTHENTICATION: Check Super Admin (with DEV MODE bypass)
    // ==========================================================================
    if (!DEV_MODE) {
      const sessionToken = getSessionToken(req);
      if (!sessionToken) {
        return res.status(401).json({
          ok: false,
          error: 'Not authenticated',
        });
      }

      const { data: session, error: sessionError } = await supabase
        .from('akari_user_sessions')
        .select('user_id, expires_at')
        .eq('session_token', sessionToken)
        .single();

      if (sessionError || !session) {
        return res.status(401).json({
          ok: false,
          error: 'Invalid session',
        });
      }

      if (new Date(session.expires_at) < new Date()) {
        await supabase
          .from('akari_user_sessions')
          .delete()
          .eq('session_token', sessionToken);
        return res.status(401).json({
          ok: false,
          error: 'Session expired',
        });
      }

      const userId = session.user_id;
      const isSuperAdmin = await checkSuperAdmin(supabase, userId);
      if (!isSuperAdmin) {
        return res.status(403).json({
          ok: false,
          error: 'Forbidden: SuperAdmin only',
        });
      }
    } else {
      console.log('[API /portal/arc/admin/arena-creators] DEV MODE - skipping auth');
    }

    // ==========================================================================
    // GET: List arena creators
    // ==========================================================================
    if (req.method !== 'GET') {
      return res.status(405).json({
        ok: false,
        error: 'Method not allowed',
      });
    }

    const { arenaId } = req.query;

    // Log received query params for debugging
    console.log('[API /portal/arc/admin/arena-creators] Received query params:', { arenaId, queryKeys: Object.keys(req.query) });

    // Validate arenaId is provided and not empty
    if (!arenaId || typeof arenaId !== 'string' || arenaId.trim() === '') {
      console.error('[API /portal/arc/admin/arena-creators] Missing or invalid arenaId:', { arenaId, type: typeof arenaId });
      return res.status(400).json({
        ok: false,
        error: 'arenaId is required and must be a non-empty string',
      });
    }

    // Query arena_creators for this arena using profile_id (not creator_profile_id)
    // Note: arena_creators has created_at, not joined_at - we'll map it in the response
    const { data: creatorsData, error: creatorsError } = await supabase
      .from('arena_creators')
      .select('twitter_username, arc_points, ring, style, meta, profile_id, created_at')
      .eq('arena_id', arenaId);

    if (creatorsError) {
      const errorMessage = creatorsError.message || 'Failed to fetch arena creators';
      console.error('[API /portal/arc/admin/arena-creators] Supabase error fetching creators:', creatorsError);
      console.error('[API /portal/arc/admin/arena-creators] Error details:', JSON.stringify(creatorsError, null, 2));
      console.error('[API /portal/arc/admin/arena-creators] Error code:', creatorsError.code);
      console.error('[API /portal/arc/admin/arena-creators] Error hint:', creatorsError.hint);
      return res.status(500).json({
        ok: false,
        error: process.env.NODE_ENV === 'development' 
          ? `${errorMessage} (code: ${creatorsError.code || 'unknown'})` 
          : 'Failed to fetch arena creators',
      });
    }

    // Get profile_ids for creators (filter out nulls)
    const creatorProfileIds = (creatorsData || [])
      .map((c: any) => c.profile_id)
      .filter((id: any) => id !== null && id !== undefined);

    // Fetch point adjustments for all creators in this arena
    let adjustmentsMap: Record<string, number> = {};

    if (creatorProfileIds.length > 0) {
      const { data: adjustmentsData, error: adjustmentsError } = await supabase
        .from('arc_point_adjustments')
        .select('creator_profile_id, points_delta, arena_id')
        .eq('arena_id', arenaId)
        .in('creator_profile_id', creatorProfileIds);

      if (adjustmentsError) {
        console.error('[API /portal/arc/admin/arena-creators] Error fetching adjustments:', adjustmentsError);
      }

      if (adjustmentsData && adjustmentsData.length > 0) {
        // Sum adjustments per creator
        for (const adj of adjustmentsData) {
          const creatorId = adj.creator_profile_id;
          if (adj.arena_id === arenaId) {
            const delta = Number(adj.points_delta) || 0;
            adjustmentsMap[creatorId] = (adjustmentsMap[creatorId] || 0) + delta;
          }
        }
      }
    }

    // Build response with effective points
    // base_points = arena_creators.arc_points
    // adjustments_sum = SUM(arc_point_adjustments.points_delta) for that arena_id + creator_profile_id
    // effective_points = base_points + COALESCE(adjustments_sum, 0)
    const creators: Creator[] = (creatorsData || []).map((creator: any) => {
      const basePoints = Number(creator.arc_points) || 0;
      // Join keys: arena_creators.profile_id = arc_point_adjustments.creator_profile_id
      const adjustmentsSum = creator.profile_id ? (adjustmentsMap[creator.profile_id] || 0) : 0;
      const effectivePoints = basePoints + adjustmentsSum;

      console.log(`[API /portal/arc/admin/arena-creators] Creator ${creator.profile_id || 'no-profile'}: base=${basePoints}, adjustments_sum=${adjustmentsSum}, effective=${effectivePoints}`);

      return {
        profile_id: creator.profile_id || null,
        twitter_username: creator.twitter_username,
        base_points: basePoints, // arena_creators.arc_points
        adjustments_sum: adjustmentsSum, // SUM(arc_point_adjustments.points_delta)
        effective_points: effectivePoints, // base_points + COALESCE(adjustments_sum, 0)
        ring: creator.ring,
        style: creator.style,
        meta: creator.meta || {},
        joined_at: creator.created_at || null, // Map created_at to joined_at for frontend compatibility
      };
    });

    // Sort by effective_points DESC
    creators.sort((a, b) => b.effective_points - a.effective_points);

    return res.status(200).json({
      ok: true,
      creators,
    });
  } catch (error: any) {
    const errorMessage = error.message || 'Internal server error';
    console.error('[API /portal/arc/admin/arena-creators] Unexpected error:', error);
    console.error('[API /portal/arc/admin/arena-creators] Error stack:', error.stack);
    return res.status(500).json({
      ok: false,
      error: process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error',
    });
  }
}

