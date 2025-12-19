/**
 * API Route: GET /api/portal/admin/arc/requests
 * 
 * List all ARC access requests (super admin only).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// =============================================================================
// TYPES
// =============================================================================

interface ArcAccessRequest {
  id: string;
  project_id: string;
  applied_by_profile_id: string | null;
  applied_by_official_x: boolean;
  application_status: 'pending' | 'approved' | 'rejected';
  approved_by_profile_id: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  project?: {
    id: string;
    name: string;
    display_name: string | null;
    slug: string | null;
    x_handle: string | null;
  };
  applied_by_profile?: {
    id: string;
    username: string;
    name: string | null;
  };
}

type RequestsResponse =
  | { ok: true; requests: ArcAccessRequest[] }
  | { ok: false; error: string };

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

async function checkSuperAdmin(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<boolean> {
  const { data: roles } = await supabase
    .from('akari_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');

  return (roles?.length ?? 0) > 0;
}

const DEV_MODE = process.env.NODE_ENV === 'development' && process.env.DEV_MODE === 'true';

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RequestsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Authentication
    if (!DEV_MODE) {
      const sessionToken = getSessionToken(req);
      if (!sessionToken) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      const { data: session, error: sessionError } = await supabase
        .from('akari_user_sessions')
        .select('user_id, expires_at')
        .eq('session_token', sessionToken)
        .single();

      if (sessionError || !session) {
        return res.status(401).json({ ok: false, error: 'Invalid session' });
      }

      if (new Date(session.expires_at) < new Date()) {
        await supabase
          .from('akari_user_sessions')
          .delete()
          .eq('session_token', sessionToken);
        return res.status(401).json({ ok: false, error: 'Session expired' });
      }

      const userId = session.user_id;

      // Check super admin
      const isSuperAdmin = await checkSuperAdmin(supabase, userId);
      if (!isSuperAdmin) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
    }

    // Get status filter from query
    const statusFilter = req.query.status as string | undefined;

    // Fetch requests
    let query = supabase
      .from('arc_project_access')
      .select(`
        *,
        project:projects!arc_project_access_project_id_fkey (
          id,
          name,
          display_name,
          slug,
          x_handle
        ),
        applied_by_profile:profiles!arc_project_access_applied_by_profile_id_fkey (
          id,
          username,
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
      query = query.eq('application_status', statusFilter);
    }

    const { data: requests, error: fetchError } = await query;

    if (fetchError) {
      console.error('[ARC Requests API] Fetch error:', fetchError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch requests' });
    }

    return res.status(200).json({
      ok: true,
      requests: (requests || []) as ArcAccessRequest[],
    });
  } catch (error: any) {
    console.error('[ARC Requests API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}





