/**
 * API Route: GET /api/portal/admin/arc/leaderboard-requests
 * 
 * Lists all ARC leaderboard requests (super admin only).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface LeaderboardRequest {
  id: string;
  project_id: string;
  requested_by: string;
  justification: string | null;
  requested_arc_access_level: 'creator_manager' | 'leaderboard' | 'gamified' | null;
  status: 'pending' | 'approved' | 'rejected';
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  project?: {
    id: string;
    name: string;
    display_name: string | null;
    slug: string | null;
    twitter_username: string | null;
  };
  requester?: {
    id: string;
    username: string;
    display_name: string | null;
  };
}

type LeaderboardRequestsResponse =
  | {
      ok: true;
      requests: LeaderboardRequest[];
    }
  | { ok: false; error: string };

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

async function checkSuperAdmin(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<boolean> {
  try {
    // Check akari_user_roles table
    const { data: userRoles, error: rolesError } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin');

    if (rolesError) {
      console.error('[Admin Leaderboard Requests API] Error checking akari_user_roles:', rolesError);
    } else if (userRoles && userRoles.length > 0) {
      return true;
    }

    // Also check profiles.real_roles via Twitter username
    const { data: xIdentity, error: identityError } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .single();

    if (identityError) {
      console.error('[Admin Leaderboard Requests API] Error checking akari_user_identities:', identityError);
      return false;
    }

    if (xIdentity?.username) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('real_roles')
        .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
        .single();

      if (profileError) {
        console.error('[Admin Leaderboard Requests API] Error checking profiles:', profileError);
        return false;
      }

      if (profile?.real_roles?.includes('super_admin')) {
        return true;
      }
    }

    return false;
  } catch (err: any) {
    console.error('[Admin Leaderboard Requests API] Error in checkSuperAdmin:', err);
    return false;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LeaderboardRequestsResponse>
) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Get session token
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Validate session and get user ID
    const { data: session, error: sessionError } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from('akari_user_sessions')
        .delete()
        .eq('session_token', sessionToken);
      return res.status(401).json({ ok: false, error: 'Session expired' });
    }

    const userId = session.user_id;

    // Check if user is super admin
    const isSuperAdmin = await checkSuperAdmin(supabase, userId);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
    }

    // Fetch all requests with project and requester info
    // requested_by is a profile ID (foreign key to profiles.id)
    const { data: requests, error: requestsError } = await supabase
      .from('arc_leaderboard_requests')
      .select(`
        id,
        project_id,
        requested_by,
        justification,
        requested_arc_access_level,
        status,
        decided_by,
        decided_at,
        created_at,
        updated_at,
        projects:project_id (
          id,
          name,
          display_name,
          slug,
          twitter_username
        )
      `)
      .order('created_at', { ascending: false });

    if (requestsError) {
      console.error('[Admin Leaderboard Requests API] Error fetching requests:', requestsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch requests' });
    }

    // Fetch requester profiles (requested_by is a profile ID)
    // First, log all requested_by values to debug "Unknown" issue
    const allRequestedBy = (requests || []).map((r: any) => ({ id: r.id, requested_by: r.requested_by }));
    if (allRequestedBy.some(r => !r.requested_by)) {
      console.warn('[Admin Leaderboard Requests API] Found requests with NULL requested_by:', 
        allRequestedBy.filter(r => !r.requested_by).map(r => r.id));
    }
    
    const requesterIds = [...new Set((requests || []).map((r: any) => r.requested_by).filter(Boolean))];
    let requesterMap = new Map<string, { id: string; username: string; display_name: string | null }>();
    
    if (requesterIds.length > 0) {
      const { data: requesters, error: requestersError } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .in('id', requesterIds);

      if (requestersError) {
        console.error('[Admin Leaderboard Requests API] Error fetching requesters:', requestersError);
        // Log which profile IDs were requested to help debug
        console.error('[Admin Leaderboard Requests API] Requested profile IDs:', requesterIds);
      } else if (requesters) {
        requesters.forEach((p: any) => {
          requesterMap.set(p.id, {
            id: p.id,
            username: p.username || null,
            display_name: p.display_name || null,
          });
        });
        // Log if some profiles were not found
        const foundIds = new Set(requesters.map((p: any) => p.id));
        const missingIds = requesterIds.filter(id => !foundIds.has(id));
        if (missingIds.length > 0) {
          console.warn('[Admin Leaderboard Requests API] Some requester profiles not found. Profile IDs:', missingIds);
          console.warn('[Admin Leaderboard Requests API] These requests will show "Unknown" requester');
        }
      }
    } else {
      console.warn('[Admin Leaderboard Requests API] No valid requester IDs found in any requests');
    }

    // Format response
    const formattedRequests: LeaderboardRequest[] = (requests || []).map((r: any) => ({
      id: r.id,
      project_id: r.project_id,
      requested_by: r.requested_by,
      justification: r.justification,
      requested_arc_access_level: r.requested_arc_access_level,
      status: r.status,
      decided_by: r.decided_by,
      decided_at: r.decided_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
      project: r.projects ? {
        id: r.projects.id,
        name: r.projects.name,
        display_name: r.projects.display_name,
        slug: r.projects.slug,
        twitter_username: r.projects.twitter_username,
      } : undefined,
      requester: r.requested_by ? requesterMap.get(r.requested_by) : undefined,
    }));

    return res.status(200).json({
      ok: true,
      requests: formattedRequests,
    });
  } catch (error: any) {
    console.error('[Admin Leaderboard Requests API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

