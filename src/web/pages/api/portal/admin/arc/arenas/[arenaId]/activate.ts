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
      return res.status(500).json({
        ok: false,
        error: result?.error || 'Activation failed',
      });
    }

    // Return RPC result directly (already matches API response format)
    return res.status(200).json({
      ok: true,
      projectId: result.projectId,
      activatedArenaId: result.activatedArenaId,
    });
  } catch (error: any) {
    console.error('[API /portal/admin/arc/arenas/[arenaId]/activate] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
