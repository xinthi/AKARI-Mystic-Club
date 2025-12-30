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
  arenaStatus?: 'active' | 'scheduled' | 'paused' | 'cancelled' | 'ended' | null;
  campaignEndedAt?: string | null;
  arenaEndedAt?: string | null;
  // New fields for live item information
  liveItemKind?: 'arena' | 'campaign' | 'gamified' | null;
  liveItemId?: string | null;
  liveItemStatus?: string | null;
  liveItemStartsAt?: string | null;
  liveItemEndsAt?: string | null;
  missingReason?: string | null;
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

    // Fetch all requests with project info
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

    // Fetch requester profiles separately (more reliable than complex joins)
    const requesterProfileIds = [...new Set((requests || []).map((r: any) => r.requested_by).filter(Boolean))];
    const requesterMap = new Map<string, { id: string; username: string; display_name: string | null }>();
    
    if (requesterProfileIds.length > 0) {
      const { data: requesters, error: requestersError } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .in('id', requesterProfileIds);

      if (requestersError) {
        console.error('[Admin Leaderboard Requests API] Error fetching requester profiles:', requestersError);
      } else if (requesters) {
        requesters.forEach((p: any) => {
          requesterMap.set(p.id, {
            id: p.id,
            username: p.username || '',
            display_name: p.display_name || null,
          });
        });
      }
    }

    // Get campaign and arena statuses for approved requests
    // Match each request to its specific arena/campaign by timing (created around decided_at)
    const approvedRequests = (requests || []).filter((r: any) => r.status === 'approved' && r.decided_at);
    
    const approvedProjectIds = approvedRequests.map((r: any) => r.project_id);
    const uniqueProjectIds = [...new Set(approvedProjectIds)];

    // Maps for tracking live item information
    const liveItemKindMap = new Map<string, 'arena' | 'campaign' | 'gamified' | null>();
    const liveItemIdMap = new Map<string, string | null>();
    const liveItemStatusMap = new Map<string, string | null>();
    const liveItemStartsAtMap = new Map<string, string | null>();
    const liveItemEndsAtMap = new Map<string, string | null>();
    const missingReasonMap = new Map<string, string | null>();
    
    // Legacy maps for backward compatibility
    const campaignStatusMap = new Map<string, 'live' | 'paused' | 'ended' | null>();
    const arenaStatusMap = new Map<string, 'active' | 'scheduled' | 'paused' | 'cancelled' | 'ended' | null>();
    const campaignEndedAtMap = new Map<string, string | null>();
    const arenaEndedAtMap = new Map<string, string | null>();

    if (uniqueProjectIds.length > 0) {
      // Get all campaigns for these projects
      const { data: campaigns } = await supabase
        .from('arc_campaigns')
        .select('id, project_id, status, created_at, start_at, end_at, updated_at')
        .in('project_id', uniqueProjectIds)
        .in('status', ['live', 'paused', 'ended'])
        .order('created_at', { ascending: false });

      // Get all arenas for these projects
      const { data: arenas } = await supabase
        .from('arenas')
        .select('id, project_id, status, created_at, starts_at, ends_at, updated_at')
        .in('project_id', uniqueProjectIds)
        .in('status', ['active', 'scheduled', 'paused', 'cancelled', 'ended'])
        .order('created_at', { ascending: false });
      
      // Get all creator_manager_programs for gamified requests
      const { data: programs } = await supabase
        .from('creator_manager_programs')
        .select('id, project_id, status, created_at, start_at, end_at, updated_at')
        .in('project_id', uniqueProjectIds)
        .in('status', ['active', 'paused', 'ended'])
        .order('created_at', { ascending: false });

      // Track which entities have been matched to avoid duplicates
      const matchedCampaignIds = new Set<string>();
      const matchedArenaIds = new Set<string>();
      const matchedProgramIds = new Set<string>();
      
      // Sort requests by decided_at to process in chronological order
      // This ensures earlier requests get matched to earlier entities
      const sortedApprovedRequests = [...approvedRequests].sort((a: any, b: any) => {
        const aTime = new Date(a.decided_at).getTime();
        const bTime = new Date(b.decided_at).getTime();
        return aTime - bTime;
      });
      
      // Match each approved request to its specific entity
      // Match by: same project_id AND created_at closest to request decided_at
      // CRITICAL: Each request must match to a unique entity (no reuse)
      sortedApprovedRequests.forEach((req: any) => {
        const decidedAt = new Date(req.decided_at).getTime();
        
        if (req.requested_arc_access_level === 'creator_manager') {
          // For CRM: Find campaign
          liveItemKindMap.set(req.id, 'campaign');
          const projectCampaigns = (campaigns || [])
            .filter((c: any) => c.project_id === req.project_id)
            .filter((c: any) => !matchedCampaignIds.has(c.id)); // Exclude already matched campaigns
          
          if (projectCampaigns.length > 0) {
            // Find campaign created closest to decided_at (within 1 hour window)
            interface CampaignItem {
              id: string;
              project_id: string;
              status: 'live' | 'paused' | 'ended';
              created_at: string;
              start_at?: string | null;
              end_at?: string | null;
              updated_at?: string | null;
            }
            let closestCampaign: CampaignItem | null = null;
            let minTimeDiff = Infinity;
            
            for (const c of projectCampaigns) {
              const campaign = c as CampaignItem;
              const campaignTime = new Date(campaign.created_at).getTime();
              const timeDiff = Math.abs(campaignTime - decidedAt);
              if (timeDiff < 3600000 && timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                closestCampaign = campaign;
              }
            }
            
            // Fallback: use campaign created closest to decided_at (even if > 1 hour)
            // But still prefer the one closest in time
            if (closestCampaign === null && projectCampaigns.length > 0) {
              for (const c of projectCampaigns) {
                const campaign = c as CampaignItem;
                const campaignTime = new Date(campaign.created_at).getTime();
                const timeDiff = Math.abs(campaignTime - decidedAt);
                if (timeDiff < minTimeDiff) {
                  minTimeDiff = timeDiff;
                  closestCampaign = campaign;
                }
              }
            }
            
            if (closestCampaign !== null) {
              matchedCampaignIds.add(closestCampaign.id);
              liveItemIdMap.set(req.id, closestCampaign.id);
              liveItemStatusMap.set(req.id, closestCampaign.status);
              liveItemStartsAtMap.set(req.id, closestCampaign.start_at || null);
              liveItemEndsAtMap.set(req.id, closestCampaign.end_at || null);
              
              // Legacy maps
              campaignStatusMap.set(req.id, closestCampaign.status);
              if (closestCampaign.status === 'ended') {
                campaignEndedAtMap.set(req.id, closestCampaign.updated_at || closestCampaign.end_at || null);
              }
            } else {
              liveItemIdMap.set(req.id, null);
              liveItemStatusMap.set(req.id, 'missing');
              missingReasonMap.set(req.id, 'No campaign found for this approved request');
            }
          } else {
            liveItemIdMap.set(req.id, null);
            liveItemStatusMap.set(req.id, 'missing');
            missingReasonMap.set(req.id, 'No campaign exists for this project');
          }
        } else if (req.requested_arc_access_level === 'leaderboard') {
          // For Leaderboard: Find arena
          liveItemKindMap.set(req.id, 'arena');
          const projectArenas = (arenas || [])
            .filter((a: any) => a.project_id === req.project_id)
            .filter((a: any) => !matchedArenaIds.has(a.id)); // Exclude already matched arenas
          
          if (projectArenas.length > 0) {
            interface ArenaItem {
              id: string;
              project_id: string;
              status: 'active' | 'scheduled' | 'paused' | 'cancelled' | 'ended';
              created_at: string;
              starts_at?: string | null;
              ends_at?: string | null;
              updated_at?: string | null;
            }
            let closestArena: ArenaItem | null = null;
            let minTimeDiff = Infinity;
            
            // First, try to find arena within 1 hour window
            for (const a of projectArenas) {
              const arena = a as ArenaItem;
              const arenaTime = new Date(arena.created_at).getTime();
              const timeDiff = Math.abs(arenaTime - decidedAt);
              if (timeDiff < 3600000 && timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                closestArena = arena;
              }
            }
            
            // Fallback: use arena created closest to decided_at (even if > 1 hour)
            if (closestArena === null && projectArenas.length > 0) {
              for (const a of projectArenas) {
                const arena = a as ArenaItem;
                const arenaTime = new Date(arena.created_at).getTime();
                const timeDiff = Math.abs(arenaTime - decidedAt);
                if (timeDiff < minTimeDiff) {
                  minTimeDiff = timeDiff;
                  closestArena = arena;
                }
              }
            }
            
            if (closestArena !== null) {
              matchedArenaIds.add(closestArena.id);
              liveItemIdMap.set(req.id, closestArena.id);
              liveItemStatusMap.set(req.id, closestArena.status);
              liveItemStartsAtMap.set(req.id, closestArena.starts_at || null);
              liveItemEndsAtMap.set(req.id, closestArena.ends_at || null);
              
              // Legacy maps
              arenaStatusMap.set(req.id, closestArena.status);
              if (closestArena.status === 'ended' || closestArena.status === 'cancelled') {
                arenaEndedAtMap.set(req.id, closestArena.updated_at || closestArena.ends_at || null);
              }
            } else {
              liveItemIdMap.set(req.id, null);
              liveItemStatusMap.set(req.id, 'missing');
              missingReasonMap.set(req.id, 'No arena found for this approved request');
            }
          } else {
            liveItemIdMap.set(req.id, null);
            liveItemStatusMap.set(req.id, 'missing');
            missingReasonMap.set(req.id, 'No arena exists for this project');
          }
        } else if (req.requested_arc_access_level === 'gamified') {
          // For Gamified: Check creator_manager_programs first, then arenas as fallback
          liveItemKindMap.set(req.id, 'gamified');
          const projectPrograms = (programs || [])
            .filter((p: any) => p.project_id === req.project_id)
            .filter((p: any) => !matchedProgramIds.has(p.id)); // Exclude already matched programs
          
          if (projectPrograms.length > 0) {
            interface ProgramItem {
              id: string;
              project_id: string;
              status: 'active' | 'paused' | 'ended';
              created_at: string;
              start_at?: string | null;
              end_at?: string | null;
              updated_at?: string | null;
            }
            let closestProgram: ProgramItem | null = null;
            let minTimeDiff = Infinity;
            
            for (const p of projectPrograms) {
              const program = p as ProgramItem;
              const programTime = new Date(program.created_at).getTime();
              const timeDiff = Math.abs(programTime - decidedAt);
              if (timeDiff < 3600000 && timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                closestProgram = program;
              }
            }
            
            // Fallback: use program created closest to decided_at
            if (closestProgram === null && projectPrograms.length > 0) {
              for (const p of projectPrograms) {
                const program = p as ProgramItem;
                const programTime = new Date(program.created_at).getTime();
                const timeDiff = Math.abs(programTime - decidedAt);
                if (timeDiff < minTimeDiff) {
                  minTimeDiff = timeDiff;
                  closestProgram = program;
                }
              }
            }
            
            if (closestProgram !== null) {
              matchedProgramIds.add(closestProgram.id);
              liveItemIdMap.set(req.id, closestProgram.id);
              liveItemStatusMap.set(req.id, closestProgram.status);
              liveItemStartsAtMap.set(req.id, closestProgram.start_at || null);
              liveItemEndsAtMap.set(req.id, closestProgram.end_at || null);
            } else {
              liveItemIdMap.set(req.id, null);
              liveItemStatusMap.set(req.id, 'missing');
              missingReasonMap.set(req.id, 'No program found for this approved request');
            }
          } else {
            // Fallback to arenas for gamified
            const projectArenas = (arenas || [])
              .filter((a: any) => a.project_id === req.project_id)
              .filter((a: any) => !matchedArenaIds.has(a.id)); // Exclude already matched arenas
            
            if (projectArenas.length > 0) {
              interface ArenaItem {
                id: string;
                project_id: string;
                status: 'active' | 'scheduled' | 'paused' | 'cancelled' | 'ended';
                created_at: string;
                starts_at?: string | null;
                ends_at?: string | null;
                updated_at?: string | null;
              }
              let closestArena: ArenaItem | null = null;
              let minTimeDiff = Infinity;
              
              for (const a of projectArenas) {
                const arena = a as ArenaItem;
                const arenaTime = new Date(arena.created_at).getTime();
                const timeDiff = Math.abs(arenaTime - decidedAt);
                if (timeDiff < 3600000 && timeDiff < minTimeDiff) {
                  minTimeDiff = timeDiff;
                  closestArena = arena;
                }
              }
              
              // Fallback: use arena created closest to decided_at
              if (closestArena === null && projectArenas.length > 0) {
                for (const a of projectArenas) {
                  const arena = a as ArenaItem;
                  const arenaTime = new Date(arena.created_at).getTime();
                  const timeDiff = Math.abs(arenaTime - decidedAt);
                  if (timeDiff < minTimeDiff) {
                    minTimeDiff = timeDiff;
                    closestArena = arena;
                  }
                }
              }
              
              if (closestArena !== null) {
                matchedArenaIds.add(closestArena.id);
                liveItemIdMap.set(req.id, closestArena.id);
                liveItemStatusMap.set(req.id, closestArena.status);
                liveItemStartsAtMap.set(req.id, closestArena.starts_at || null);
                liveItemEndsAtMap.set(req.id, closestArena.ends_at || null);
                
                // Legacy maps
                arenaStatusMap.set(req.id, closestArena.status);
                if (closestArena.status === 'ended' || closestArena.status === 'cancelled') {
                  arenaEndedAtMap.set(req.id, closestArena.updated_at || closestArena.ends_at || null);
                }
              } else {
                liveItemIdMap.set(req.id, null);
                liveItemStatusMap.set(req.id, 'missing');
                missingReasonMap.set(req.id, 'No arena or program found for this approved request');
              }
            } else {
              liveItemIdMap.set(req.id, null);
              liveItemStatusMap.set(req.id, 'missing');
              missingReasonMap.set(req.id, 'No program or arena exists for this project');
            }
          }
        }
      });
    }

    // Format response - use requester profile from map
    const formattedRequests: LeaderboardRequest[] = (requests || [])
      .map((r: any) => {
        // Get requester profile from map
        let requester: { id: string; username: string; display_name: string | null } | undefined;
        let requestedByDisplayName: string | undefined;
        let requestedByUsername: string | undefined;

        if (r.requested_by && requesterMap.has(r.requested_by)) {
          requester = requesterMap.get(r.requested_by);
          if (requester) {
            requestedByDisplayName = requester.display_name || requester.username || undefined;
            requestedByUsername = requester.username || undefined;
          }
        } else if (r.requested_by) {
          // Log when requester profile is missing (should not happen if requested_by is valid)
          console.warn(`[Admin Leaderboard Requests API] Requester profile not found for request ${r.id} (requested_by: ${r.requested_by})`);
        }

        // Get status for this specific request (matched by request ID)
        const campaignStatus = r.status === 'approved' ? (campaignStatusMap.get(r.id) || null) : null;
        const arenaStatus = r.status === 'approved' ? (arenaStatusMap.get(r.id) || null) : null;
        // Get end dates for ended campaigns/arenas
        const campaignEndedAt = campaignStatus === 'ended' ? (campaignEndedAtMap.get(r.id) || null) : null;
        const arenaEndedAt = (arenaStatus === 'ended' || arenaStatus === 'cancelled') ? (arenaEndedAtMap.get(r.id) || null) : null;
        
        // Get live item information for approved requests
        const liveItemKind = r.status === 'approved' ? (liveItemKindMap.get(r.id) || null) : null;
        const liveItemId = r.status === 'approved' ? (liveItemIdMap.get(r.id) || null) : null;
        const liveItemStatus = r.status === 'approved' ? (liveItemStatusMap.get(r.id) || null) : null;
        const liveItemStartsAt = r.status === 'approved' ? (liveItemStartsAtMap.get(r.id) || null) : null;
        const liveItemEndsAt = r.status === 'approved' ? (liveItemEndsAtMap.get(r.id) || null) : null;
        const missingReason = r.status === 'approved' ? (missingReasonMap.get(r.id) || null) : null;

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
          campaignEndedAt,
          arenaEndedAt,
          liveItemKind,
          liveItemId,
          liveItemStatus,
          liveItemStartsAt,
          liveItemEndsAt,
          missingReason,
        };
      });

    // Set cache-control headers to prevent caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    return res.status(200).json({
      ok: true,
      requests: formattedRequests,
    });
  } catch (error: any) {
    console.error('[Admin Leaderboard Requests API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

