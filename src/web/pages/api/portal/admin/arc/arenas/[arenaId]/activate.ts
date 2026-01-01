/**
 * API Route: POST /api/portal/admin/arc/arenas/[arenaId]/activate
 * 
 * Activates a mindshare arena for a project.
 * Ends any currently active MS/legacy_ms arenas for the project before activating the target arena.
 * Super admin only.
 * 
 * Example curl usage:
 *   curl -X POST "http://localhost:3000/api/portal/admin/arc/arenas/123e4567-e89b-12d3-a456-426614174000/activate" \
 *     -H "Content-Type: application/json" \
 *     -H "Cookie: akari_session=your_session_token" \
 *     -d '{}'
 * 
 * Response:
 *   {
 *     "ok": true,
 *     "projectId": "456e7890-e89b-12d3-a456-426614174000",
 *     "activatedArenaId": "123e4567-e89b-12d3-a456-426614174000"
 *   }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/server/require-superadmin';
import { writeArcAudit, getRequestId } from '@/lib/server/arc-audit';

// =============================================================================
// TYPES
// =============================================================================

type ActivateArenaResponse =
  | {
      ok: true;
      projectId: string;
      activatedArenaId: string;
    }
  | {
      ok: false;
      error: string;
    };


// =============================================================================
// HELPERS
// =============================================================================

/**
 * Validate UUID format
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Get profile ID from user ID
 */
async function getProfileIdFromUserId(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<string | null> {
  try {
    const { data: xIdentity, error: identityError } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .single();

    if (identityError || !xIdentity?.username) {
      return null;
    }

    const cleanUsername = xIdentity.username.toLowerCase().replace('@', '').trim();
    
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (profileError || !profile) {
      return null;
    }

    return profile.id;
  } catch (err) {
    return null;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ActivateArenaResponse>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  // Check authentication and SuperAdmin status
  const auth = await requireSuperAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({
      ok: false,
      error: auth.error,
    });
  }

  const { arenaId } = req.query;

  // Validate arenaId is a UUID
  if (!arenaId || typeof arenaId !== 'string' || !isValidUUID(arenaId)) {
    return res.status(400).json({
      ok: false,
      error: 'invalid_arena_id',
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get admin profile ID
    const adminProfileId = await getProfileIdFromUserId(supabase, auth.profileId);
    if (!adminProfileId) {
      return res.status(401).json({
        ok: false,
        error: 'Admin profile not found',
      });
    }

    // Fetch arena to get project_id for counting active arenas
    const { data: arenaData, error: arenaDataError } = await supabase
      .from('arenas')
      .select('project_id')
      .eq('id', arenaId)
      .single();

    // Count active arenas that will be ended (before RPC call)
    let endedOthersCount = 0;
    if (arenaData?.project_id) {
      const { count } = await supabase
        .from('arenas')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', arenaData.project_id)
        .eq('status', 'active')
        .in('kind', ['ms', 'legacy_ms'])
        .neq('id', arenaId);
      endedOthersCount = count || 0;
    }

    // Call RPC function to handle activation in a single transaction
    const { data: result, error: rpcError } = await supabase.rpc(
      'arc_admin_activate_ms_arena',
      {
        p_arena_id: arenaId,
        p_admin_profile_id: adminProfileId,
      }
    );

    if (rpcError) {
      console.error('[Activate Arena API] RPC error:', rpcError);

      // Map RPC errors to HTTP status codes
      const errorMessage = rpcError.message || rpcError.details || 'Unknown error';
      
      // Log audit for RPC error
      const auditRequestId = getRequestId(req);
      await writeArcAudit(supabase, {
        actorProfileId: adminProfileId,
        projectId: null,
        entityType: 'arena',
        entityId: arenaId,
        action: 'arena_activated',
        success: false,
        message: errorMessage,
        requestId: auditRequestId,
        metadata: { rpcError: errorMessage },
      });
      
      if (errorMessage.includes('arena_not_found')) {
        return res.status(404).json({
          ok: false,
          error: 'Arena not found',
        });
      }
      
      if (errorMessage.includes('invalid_arena_kind')) {
        return res.status(400).json({
          ok: false,
          error: 'invalid_arena_kind',
        });
      }

      if (errorMessage.includes('invalid_project_id')) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid project_id',
        });
      }

      // Other errors
      return res.status(500).json({
        ok: false,
        error: errorMessage,
      });
    }

    if (!result || !result.ok) {
      const auditRequestId = getRequestId(req);
      await writeArcAudit(supabase, {
        actorProfileId: adminProfileId,
        projectId: null,
        entityType: 'arena',
        entityId: arenaId,
        action: 'arena_activated',
        success: false,
        message: result?.error || 'Activation failed',
        requestId: auditRequestId,
        metadata: { result },
      });
      return res.status(500).json({
        ok: false,
        error: result?.error || 'Activation failed',
      });
    }

    // Log successful activation
    const auditRequestId = getRequestId(req);
    await writeArcAudit(supabase, {
      actorProfileId: adminProfileId,
      projectId: result.projectId,
      entityType: 'arena',
      entityId: result.activatedArenaId,
      action: 'arena_activated',
      success: true,
      message: `Arena ${result.activatedArenaId} activated for project ${result.projectId}`,
      requestId: auditRequestId,
      metadata: {
        ...(endedOthersCount > 0 && { endedOthersCount }),
      },
    });

    // Return RPC result directly (already matches API response format)
    return res.status(200).json({
      ok: true,
      projectId: result.projectId,
      activatedArenaId: result.activatedArenaId,
    });
  } catch (error: any) {
    console.error('[API /portal/admin/arc/arenas/[arenaId]/activate] Error:', error);
    const supabase = getSupabaseAdmin();
    const auditRequestId = getRequestId(req);
    const auth = await requireSuperAdmin(req);
    const adminProfileId = auth.ok ? await getProfileIdFromUserId(supabase, auth.profileId) : null;
    await writeArcAudit(supabase, {
      actorProfileId: adminProfileId,
      projectId: null,
      entityType: 'arena',
      entityId: typeof arenaId === 'string' ? arenaId : null,
      action: 'arena_activated',
      success: false,
      message: error.message || 'Internal server error',
      requestId: auditRequestId,
      metadata: { error: error.message || 'Unknown error' },
    });
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
