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
  campaignStatus?: 'live' | 'paused' | 'ended' | null;
  arenaStatus?: 'active' | 'scheduled' | 'cancelled' | 'ended' | null;
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
      const profileIdsArray = Array.from(allProfileIds);
      console.log(`[Admin Leaderboard Requests API] Fetching ${profileIdsArray.length} profiles for requester lookup:`, profileIdsArray.slice(0, 5), profileIdsArray.length > 5 ? '...' : '');
      
      const { data: requesters, error: requestersError } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .in('id', profileIdsArray);

      if (requestersError) {
        console.error('[Admin Leaderboard Requests API] Error fetching requester profiles:', requestersError);
      } else if (requesters) {
        console.log(`[Admin Leaderboard Requests API] Found ${requesters.length} profiles`);
        requesters.forEach((p: any) => {
          requesterMap.set(p.id, {
            id: p.id,
            username: p.username || null,
            display_name: p.display_name || null,
          });
        });
      } else {
        console.warn(`[Admin Leaderboard Requests API] No profiles found for ${profileIdsArray.length} profile IDs`);
      }
    } else {
      console.warn('[Admin Leaderboard Requests API] No profile IDs collected for requester lookup');
    }

    // Get campaign and arena statuses for approved requests
    // Match each request to its specific arena/campaign by timing (created around decided_at)
    const approvedRequests = (requests || []).filter((r: any) => r.status === 'approved' && r.decided_at);
    
    const approvedProjectIds = approvedRequests.map((r: any) => r.project_id);
    const uniqueProjectIds = [...new Set(approvedProjectIds)];

    // Map: request_id -> status (for specific matching)
    const campaignStatusMap = new Map<string, 'live' | 'paused' | 'ended' | null>();
    const arenaStatusMap = new Map<string, 'active' | 'scheduled' | 'cancelled' | 'ended' | null>();

    if (uniqueProjectIds.length > 0) {
      // Get all campaigns for these projects
      const { data: campaigns } = await supabase
        .from('arc_campaigns')
        .select('id, project_id, status, created_at')
        .in('project_id', uniqueProjectIds)
        .in('status', ['live', 'paused', 'ended'])
        .order('created_at', { ascending: false });

      // Get all arenas for these projects
      const { data: arenas } = await supabase
        .from('arenas')
        .select('id, project_id, status, created_at')
        .in('project_id', uniqueProjectIds)
        .in('status', ['active', 'scheduled', 'cancelled', 'ended'])
        .order('created_at', { ascending: false });

      // Match each approved request to its specific campaign/arena
      // Match by: same project_id AND created_at closest to request decided_at
      approvedRequests.forEach((req: any) => {
        const decidedAt = new Date(req.decided_at).getTime();
        
        if (req.requested_arc_access_level === 'creator_manager') {
          // For CRM: Find campaign created closest to approval time
          const projectCampaigns = (campaigns || []).filter((c: any) => c.project_id === req.project_id);
          if (projectCampaigns.length > 0) {
            // Find campaign created closest to decided_at (within 1 hour window)
            interface CampaignItem {
              id: string;
              project_id: string;
              status: 'live' | 'paused' | 'ended';
              created_at: string;
            }
            let closestCampaign: CampaignItem | null = null;
            let minTimeDiff = Infinity;
            
            for (const c of projectCampaigns) {
              const campaign = c as CampaignItem;
              const campaignTime = new Date(campaign.created_at).getTime();
              const timeDiff = Math.abs(campaignTime - decidedAt);
              // Match if created within 1 hour of approval
              if (timeDiff < 3600000 && timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                closestCampaign = campaign;
              }
            }
            
            if (closestCampaign !== null) {
              campaignStatusMap.set(req.id, closestCampaign.status);
            } else {
              // No campaign found near approval time - check if any active campaign exists
              const activeCampaign = projectCampaigns.find((c: any) => {
                const campaign = c as CampaignItem;
                return campaign.status === 'live' || campaign.status === 'paused';
              }) as CampaignItem | undefined;
              if (activeCampaign) {
                campaignStatusMap.set(req.id, activeCampaign.status);
              }
            }
          }
        } else if (req.requested_arc_access_level === 'leaderboard' || req.requested_arc_access_level === 'gamified') {
          // For Leaderboard/Gamified: Find arena created closest to approval time
          const projectArenas = (arenas || []).filter((a: any) => a.project_id === req.project_id);
          if (projectArenas.length > 0) {
            // Find arena created closest to decided_at (within 1 hour window)
            interface ArenaItem {
              id: string;
              project_id: string;
              status: 'active' | 'scheduled' | 'cancelled' | 'ended';
              created_at: string;
            }
            let closestArena: ArenaItem | null = null;
            let minTimeDiff = Infinity;
            
            for (const a of projectArenas) {
              const arena = a as ArenaItem;
              const arenaTime = new Date(arena.created_at).getTime();
              const timeDiff = Math.abs(arenaTime - decidedAt);
              // Match if created within 1 hour of approval
              if (timeDiff < 3600000 && timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                closestArena = arena;
              }
            }
            
            if (closestArena !== null) {
              arenaStatusMap.set(req.id, closestArena.status);
            } else {
              // No arena found near approval time - check if any active arena exists
              const activeArena = projectArenas.find((a: any) => {
                const arena = a as ArenaItem;
                return arena.status === 'active' || arena.status === 'scheduled';
              }) as ArenaItem | undefined;
              if (activeArena) {
                arenaStatusMap.set(req.id, activeArena.status);
              }
            }
          }
        }
      });
    }

    // Format response with fallback requester logic
    const formattedRequests: LeaderboardRequest[] = (requests || [])
      .map((r: any) => {
        // Determine requester with fallback priority:
        // 1. requested_by profile
        // 2. decided_by profile (approver)
        // 3. project.claimed_by profile
        // 4. null (UI will show "Unknown")
        
        let requester: { id: string; username: string; display_name: string | null } | undefined;
        let requestedByDisplayName: string | undefined;
        let requestedByUsername: string | undefined;

        if (r.requested_by) {
          if (requesterMap.has(r.requested_by)) {
            requester = requesterMap.get(r.requested_by);
          } else {
            console.warn(`[Admin Leaderboard Requests API] Profile not found for requested_by: ${r.requested_by} (request ID: ${r.id})`);
          }
        }
        
        // Only use fallbacks if requested_by profile not found
        if (!requester) {
          if (r.decided_by && requesterMap.has(r.decided_by)) {
            // Fallback to approver
            requester = requesterMap.get(r.decided_by);
            console.log(`[Admin Leaderboard Requests API] Using decided_by as fallback for request ${r.id}`);
          } else if (r.projects) {
            const claimedBy = projectClaimedByMap.get(r.project_id);
            if (claimedBy && requesterMap.has(claimedBy)) {
              // Fallback to project owner
              requester = requesterMap.get(claimedBy);
              console.log(`[Admin Leaderboard Requests API] Using project claimed_by as fallback for request ${r.id}`);
            }
          }
        }

        // Set display fields for UI
        if (requester) {
          requestedByDisplayName = requester.display_name || requester.username || undefined;
          requestedByUsername = requester.username || undefined;
        } else {
          // Log when no requester found at all
          console.warn(`[Admin Leaderboard Requests API] No requester found for request ${r.id} (requested_by: ${r.requested_by}, decided_by: ${r.decided_by})`);
        }

        // Get status for this specific request (matched by request ID)
        const campaignStatus = r.status === 'approved' ? (campaignStatusMap.get(r.id) || null) : null;
        const arenaStatus = r.status === 'approved' ? (arenaStatusMap.get(r.id) || null) : null;

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
          campaignStatus,
          arenaStatus,
        };
      })
      // Filter out approved requests where the specific campaign/arena has been ended/cancelled
      .filter((req: LeaderboardRequest) => {
        // Keep all pending/rejected requests
        if (req.status !== 'approved') {
          return true;
        }
        // For approved requests, check status based on requested access level
        // Hide if the specific campaign/arena matched to this request is ended/cancelled
        const accessLevel = req.requested_arc_access_level;
        
        if (accessLevel === 'creator_manager') {
          // For CRM requests, hide if campaign is ended
          return req.campaignStatus !== 'ended';
        } else if (accessLevel === 'leaderboard' || accessLevel === 'gamified') {
          // For leaderboard/gamified requests, hide if arena is ended/cancelled
          return req.arenaStatus !== 'ended' && req.arenaStatus !== 'cancelled';
        }
        
        // If access level is null or unknown, show the request
        return true;
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

