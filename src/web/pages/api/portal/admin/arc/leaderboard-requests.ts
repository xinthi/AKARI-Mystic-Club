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
  requestedByDisplayName?: string;
  requestedByUsername?: string;
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

    // Fetch requester profiles with fallback logic
    // Priority: requested_by > decided_by > project.claimed_by > "N/A"
    
    // Collect all possible profile IDs for fallback lookup
    const allProfileIds = new Set<string>();
    (requests || []).forEach((r: any) => {
      if (r.requested_by) allProfileIds.add(r.requested_by);
      if (r.decided_by) allProfileIds.add(r.decided_by);
      if (r.projects?.claimed_by) allProfileIds.add(r.projects.claimed_by);
    });

    // Get project claimed_by values
    const projectIds = [...new Set((requests || []).map((r: any) => r.project_id).filter(Boolean))];
    const { data: projectsWithClaimedBy } = await supabase
      .from('projects')
      .select('id, claimed_by')
      .in('id', projectIds);

    const projectClaimedByMap = new Map<string, string>();
    if (projectsWithClaimedBy) {
      projectsWithClaimedBy.forEach((p: any) => {
        if (p.claimed_by) {
          allProfileIds.add(p.claimed_by);
          projectClaimedByMap.set(p.id, p.claimed_by);
        }
      });
    }

    // Fetch all potential requester profiles
    let requesterMap = new Map<string, { id: string; username: string; display_name: string | null }>();
    
    if (allProfileIds.size > 0) {
      const { data: requesters, error: requestersError } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .in('id', Array.from(allProfileIds));

      if (requestersError) {
        console.error('[Admin Leaderboard Requests API] Error fetching requester profiles:', requestersError);
      } else if (requesters) {
        requesters.forEach((p: any) => {
          requesterMap.set(p.id, {
            id: p.id,
            username: p.username || null,
            display_name: p.display_name || null,
          });
        });
      }
    }

    // Format response with fallback requester logic
    const formattedRequests: LeaderboardRequest[] = (requests || []).map((r: any) => {
      // Determine requester with fallback priority:
      // 1. requested_by profile
      // 2. decided_by profile (approver)
      // 3. project.claimed_by profile
      // 4. null (UI will show "N/A")
      
      let requester: { id: string; username: string; display_name: string | null } | undefined;
      let requestedByDisplayName: string | undefined;
      let requestedByUsername: string | undefined;

      if (r.requested_by && requesterMap.has(r.requested_by)) {
        requester = requesterMap.get(r.requested_by);
      } else if (r.decided_by && requesterMap.has(r.decided_by)) {
        // Fallback to approver
        requester = requesterMap.get(r.decided_by);
      } else if (r.projects) {
        const claimedBy = projectClaimedByMap.get(r.project_id);
        if (claimedBy && requesterMap.has(claimedBy)) {
          // Fallback to project owner
          requester = requesterMap.get(claimedBy);
        }
      }

      // Set display fields for UI
      if (requester) {
        requestedByDisplayName = requester.display_name || requester.username || undefined;
        requestedByUsername = requester.username || undefined;
      }

      return {
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
        requester,
        requestedByDisplayName,
        requestedByUsername,
      };
    });

    return res.status(200).json({
      ok: true,
      requests: formattedRequests,
    });
  } catch (error: any) {
    console.error('[Admin Leaderboard Requests API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

