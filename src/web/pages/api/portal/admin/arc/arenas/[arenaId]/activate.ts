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
import { isSuperAdminServerSide } from '@/lib/server-auth';

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
 * Extract session token from request cookies
 */
function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

/**
 * Get user ID from session token
 */
async function getUserIdFromSession(sessionToken: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: session, error } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (error || !session) {
      return null;
    }

    if (new Date(session.expires_at) < new Date()) {
      await supabase.from('akari_user_sessions').delete().eq('session_token', sessionToken);
      return null;
    }

    return session.user_id;
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

  // Check authentication
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({
      ok: false,
      error: 'Not authenticated',
    });
  }

  const userId = await getUserIdFromSession(sessionToken);
  if (!userId) {
    return res.status(401).json({
      ok: false,
      error: 'Invalid session',
    });
  }

  // Check super admin
  const isSuperAdmin = await isSuperAdminServerSide(userId);
  if (!isSuperAdmin) {
    return res.status(403).json({
      ok: false,
      error: 'SuperAdmin only',
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
