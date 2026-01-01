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
    const now = new Date().toISOString();

    // Step 1: Fetch the arena to get project_id and validate kind
    const { data: arena, error: arenaError } = await supabase
      .from('arenas')
      .select('id, project_id, kind, status')
      .eq('id', arenaId)
      .single();

    if (arenaError || !arena) {
      console.error('[API /portal/admin/arc/arenas/[arenaId]/activate] Error fetching arena:', arenaError);
      return res.status(404).json({
        ok: false,
        error: 'Arena not found',
      });
    }

    // Always use arena.project_id
    const targetProjectId = arena.project_id;

    if (!targetProjectId || !isValidUUID(targetProjectId)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid project_id',
      });
    }

    // Check arena kind - must be 'ms' or 'legacy_ms'
    if (arena.kind !== 'ms' && arena.kind !== 'legacy_ms') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_arena_kind',
      });
    }

    // Step 3: End any currently active MS/legacy_ms arenas for that project
    const { error: endOthersError } = await supabase
      .from('arenas')
      .update({
        status: 'ended',
        ends_at: now,        // simple and safe
        updated_at: now,
      })
      .eq('project_id', targetProjectId)
      .eq('status', 'active')
      .in('kind', ['ms', 'legacy_ms'])
      .neq('id', arenaId);

    if (endOthersError) {
      console.error('[activate] Error ending other arenas:', endOthersError);
      return res.status(500).json({ ok: false, error: 'Failed to end existing arenas' });
    }

    // Step 4: Activate the target arena
    const { error: activateError } = await supabase
      .from('arenas')
      .update({
        status: 'active',
        updated_at: now,
      })
      .eq('id', arenaId);

    if (activateError) {
      console.error('[API /portal/admin/arc/arenas/[arenaId]/activate] Error activating arena:', activateError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to activate arena',
      });
    }

    return res.status(200).json({
      ok: true,
      projectId: targetProjectId,
      activatedArenaId: arenaId,
    });
  } catch (error: any) {
    console.error('[API /portal/admin/arc/arenas/[arenaId]/activate] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
