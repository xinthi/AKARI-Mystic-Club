/**
 * API Route: POST /api/portal/arc/admin/point-adjustments
 * API Route: GET /api/portal/arc/admin/point-adjustments
 * 
 * SuperAdmin-only endpoints for creating and viewing point adjustments.
 * POST: Create a new adjustment
 * GET: List adjustments (filtered by arenaId and optionally creatorProfileId)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkProjectPermissions } from '@/lib/project-permissions';
import { hasAnyArcAccess } from '@/lib/arc-access';

// =============================================================================
// TYPES
// =============================================================================

type PointAdjustment = {
  id: string;
  arena_id: string;
  creator_profile_id: string;
  points_delta: number;
  reason: string;
  created_by_profile_id: string;
  created_at: string;
  metadata: Record<string, any> | null;
};

type CreateAdjustmentRequest = {
  arenaId: string;
  creatorProfileId: string;
  pointsDelta: number;
  reason: string;
};

type CreateAdjustmentResponse =
  | {
      ok: true;
      adjustment: PointAdjustment;
    }
  | {
      ok: false;
      error: string;
    };

type GetAdjustmentsResponse =
  | {
      ok: true;
      adjustments: PointAdjustment[];
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================================
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
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

async function getProjectIdFromArenaId(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  arenaId: string
): Promise<string | null> {
  const { data: arena, error } = await supabase
    .from('arenas')
    .select('project_id')
    .eq('id', arenaId)
    .single();

  if (error || !arena) {
    return null;
  }

  return arena.project_id;
}

async function getCurrentUserProfile(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessionToken: string
): Promise<{ profileId: string; userId: string } | null> {
  const { data: session, error: sessionError } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (sessionError || !session) {
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    return null;
  }

  // Get user's Twitter username to find profile
  const { data: xIdentity, error: identityError } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', session.user_id)
    .eq('provider', 'x')
    .single();

  if (identityError || !xIdentity?.username) {
    return null;
  }

  const cleanUsername = xIdentity.username.toLowerCase().replace('@', '');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', cleanUsername)
    .single();

  if (profileError || !profile) {
    return null;
  }

  return { profileId: profile.id, userId: session.user_id };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateAdjustmentResponse | GetAdjustmentsResponse>
) {
  const supabase = getSupabaseAdmin();

  // ==========================================================================
  // AUTHENTICATION: Check project permissions
  // ==========================================================================
  const DEV_MODE = process.env.NODE_ENV === 'development';
  
  let userId: string | null = null;

  if (!DEV_MODE) {
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({
        ok: false,
        error: 'Not authenticated',
      });
    }

    const userProfile = await getCurrentUserProfile(supabase, sessionToken);
    if (!userProfile) {
      return res.status(401).json({
        ok: false,
        error: 'Invalid session',
      });
    }

    userId = userProfile.userId;

    // Runtime guard: ensure userId is a non-empty string
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Missing userId',
      });
    }

    // TypeScript narrowing: assign to const with explicit string type
    const uid: string = userId;

    // Get arenaId from request
    let arenaId: string | null = null;
    if (req.method === 'POST') {
      arenaId = (req.body as CreateAdjustmentRequest)?.arenaId || null;
    } else if (req.method === 'GET') {
      arenaId = (req.query.arenaId as string) || null;
    }

    if (!arenaId) {
      return res.status(400).json({
        ok: false,
        error: 'arenaId is required',
      });
    }

    // Get projectId from arenaId
    const projectId = await getProjectIdFromArenaId(supabase, arenaId);
    if (!projectId) {
      return res.status(404).json({
        ok: false,
        error: 'Arena not found',
      });
    }

    // Runtime guard: ensure projectId is a non-empty string
    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Missing projectId',
      });
    }

    // TypeScript narrowing: assign to const with explicit string type
    const pid: string = projectId;

    // Check project permissions
    const permissions = await checkProjectPermissions(supabase, uid, pid);
    
    // Point adjustments require: isSuperAdmin OR isOwner OR isAdmin OR isModerator
    const canWrite = permissions.isSuperAdmin || permissions.isOwner || permissions.isAdmin || permissions.isModerator;
    
    if (!canWrite) {
      return res.status(403).json({
        ok: false,
        error: 'You do not have permission to adjust points for this project',
      });
    }

    // Check ARC access (any option approved)
    const hasArcAccess = await hasAnyArcAccess(supabase, pid);
    if (!hasArcAccess) {
      return res.status(403).json({
        ok: false,
        error: 'ARC access not approved for this project',
      });
    }
  } else {
    console.log('[API /portal/arc/admin/point-adjustments] DEV MODE - skipping auth');
  }

  // ==========================================================================
  // POST: Create adjustment
  // ==========================================================================
  if (req.method === 'POST') {
    try {
      const body: CreateAdjustmentRequest = req.body;

      if (!body.arenaId || !body.creatorProfileId || body.pointsDelta === undefined || !body.reason) {
        return res.status(400).json({
          ok: false,
          error: 'Missing required fields: arenaId, creatorProfileId, pointsDelta, reason',
        });
      }

      // Get current user profile for created_by
      let createdByProfileId: string;
      if (DEV_MODE) {
        // In dev mode, use a dummy profile ID or the creator's profile ID
        // For now, use creatorProfileId as fallback (not ideal but works for dev)
        createdByProfileId = body.creatorProfileId;
      } else {
        const sessionToken = getSessionToken(req);
        if (!sessionToken) {
          return res.status(401).json({
            ok: false,
            error: 'Not authenticated',
          });
        }
        const userProfile = await getCurrentUserProfile(supabase, sessionToken);
        if (!userProfile) {
          return res.status(401).json({
            ok: false,
            error: 'Invalid session',
          });
        }
        createdByProfileId = userProfile.profileId;
      }

      // Verify creator exists in arena (but don't update arc_points - it stays as base_points)
      const { data: creatorEntry, error: creatorError } = await supabase
        .from('arena_creators')
        .select('id, profile_id')
        .eq('arena_id', body.arenaId)
        .eq('profile_id', body.creatorProfileId)
        .single();

      if (creatorError || !creatorEntry) {
        console.error('[API /portal/arc/admin/point-adjustments] Creator entry not found:', creatorError);
        return res.status(404).json({
          ok: false,
          error: 'Creator not found in this arena',
        });
      }

      // Insert adjustment (do NOT update arena_creators.arc_points - it remains as base_points)
      // effective_points will be calculated as base_points + SUM(adjustments) in the query
      const { data: adjustment, error: insertError } = await supabase
        .from('arc_point_adjustments')
        .insert({
          arena_id: body.arenaId,
          creator_profile_id: body.creatorProfileId,
          points_delta: body.pointsDelta,
          reason: body.reason,
          created_by_profile_id: createdByProfileId,
          metadata: null,
        })
        .select()
        .single();

      if (insertError) {
        console.error('[API /portal/arc/admin/point-adjustments] Insert error:', insertError);
        return res.status(500).json({
          ok: false,
          error: 'Failed to create adjustment',
        });
      }

      return res.status(200).json({
        ok: true,
        adjustment: {
          id: adjustment.id,
          arena_id: adjustment.arena_id,
          creator_profile_id: adjustment.creator_profile_id,
          points_delta: Number(adjustment.points_delta),
          reason: adjustment.reason,
          created_by_profile_id: adjustment.created_by_profile_id,
          created_at: adjustment.created_at,
          metadata: adjustment.metadata,
        },
      });
    } catch (error: any) {
      console.error('[API /portal/arc/admin/point-adjustments] Error:', error);
      return res.status(500).json({
        ok: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  // ==========================================================================
  // GET: List adjustments
  // ==========================================================================
  if (req.method === 'GET') {
    try {
      const { arenaId, creatorProfileId } = req.query;

      if (!arenaId || typeof arenaId !== 'string') {
        return res.status(400).json({
          ok: false,
          error: 'arenaId is required',
        });
      }

      let query = supabase
        .from('arc_point_adjustments')
        .select('*')
        .eq('arena_id', arenaId)
        .order('created_at', { ascending: false });

      if (creatorProfileId && typeof creatorProfileId === 'string') {
        query = query.eq('creator_profile_id', creatorProfileId);
      }

      const { data: adjustments, error: fetchError } = await query;

      if (fetchError) {
        console.error('[API /portal/arc/admin/point-adjustments] Fetch error:', fetchError);
        return res.status(500).json({
          ok: false,
          error: 'Failed to fetch adjustments',
        });
      }

      return res.status(200).json({
        ok: true,
        adjustments: (adjustments || []).map((adj: any) => ({
          id: adj.id,
          arena_id: adj.arena_id,
          creator_profile_id: adj.creator_profile_id,
          points_delta: Number(adj.points_delta),
          reason: adj.reason,
          created_by_profile_id: adj.created_by_profile_id,
          created_at: adj.created_at,
          metadata: adj.metadata,
        })),
      });
    } catch (error: any) {
      console.error('[API /portal/arc/admin/point-adjustments] Error:', error);
      return res.status(500).json({
        ok: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  return res.status(405).json({
    ok: false,
    error: 'Method not allowed',
  });
}

