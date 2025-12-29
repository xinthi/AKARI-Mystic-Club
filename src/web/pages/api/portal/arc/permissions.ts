/**
 * API Route: GET /api/portal/arc/permissions?projectId=<uuid>
 * 
 * Returns project permissions for the current user.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkProjectPermissions, type ProjectPermissionCheck } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface PermissionsResponse {
  ok: true;
  permissions: ProjectPermissionCheck;
}

interface ErrorResponse {
  ok: false;
  error: string;
}

type Response = PermissionsResponse | ErrorResponse;

// =============================================================================
// DEV MODE BYPASS
// =============================================================================

const DEV_MODE = process.env.NODE_ENV === 'development';

// =============================================================================
// HELPERS
// =============================================================================

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

async function getUserIdFromSession(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessionToken: string
): Promise<string | null> {
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

  return session.user_id;
}

async function getDevSuperAdminUserId(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<string | null> {
  // Find a super admin user in DEV MODE
  const { data: superAdminRole } = await supabase
    .from('akari_user_roles')
    .select('user_id')
    .eq('role', 'super_admin')
    .limit(1)
    .maybeSingle();

  if (superAdminRole) {
    return superAdminRole.user_id;
  }

  // If no super admin found, try to find any user
  const { data: anyUser } = await supabase
    .from('akari_users')
    .select('id')
    .limit(1)
    .maybeSingle();

  return anyUser?.id || null;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Response>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // ==========================================================================
    // AUTHENTICATION: Get user ID (with DEV MODE bypass)
    // ==========================================================================
    let userId: string | null = null;

    if (!DEV_MODE) {
      // Production: require valid session
      const sessionToken = getSessionToken(req);
      if (!sessionToken) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      userId = await getUserIdFromSession(supabase, sessionToken);
      if (!userId) {
        return res.status(401).json({ ok: false, error: 'Invalid session' });
      }
    } else {
      // DEV MODE: bypass authentication, use super admin or any user
      console.log('[API /portal/arc/permissions] DEV MODE - bypassing auth');
      userId = await getDevSuperAdminUserId(supabase);
      if (!userId) {
        // If no user found, return default permissions that allow everything
        console.warn('[API /portal/arc/permissions] DEV MODE - no user found, returning default permissions');
        const defaultPermissions: ProjectPermissionCheck = {
          canManage: true,
          isOwner: false,
          isAdmin: false,
          isModerator: false,
          isInvestorView: false,
          isSuperAdmin: true,
          hasProjectAdminRole: false,
        };
        return res.status(200).json({ ok: true, permissions: defaultPermissions });
      }
    }

    // Runtime guard: ensure userId is a non-empty string
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Missing userId' });
    }

    // TypeScript narrowing: assign to const with explicit string type
    const uid: string = userId;

    // Validate projectId query parameter
    const projectId = req.query.projectId;
    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Missing projectId' });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      return res.status(400).json({ ok: false, error: 'Invalid projectId format' });
    }

    // TypeScript narrowing: assign to const with explicit string type
    const pid: string = projectId;

    // Check project permissions
    const permissions = await checkProjectPermissions(supabase, uid, pid);

    return res.status(200).json({ ok: true, permissions });
  } catch (err: any) {
    console.error('[API /portal/arc/permissions] Error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Internal server error',
    });
  }
}

