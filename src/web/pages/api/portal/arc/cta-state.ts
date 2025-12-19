/**
 * API Route: GET /api/portal/arc/cta-state?projectId=<uuid>
 * 
 * Consolidated endpoint that returns all ARC CTA state in one response.
 * This prevents multiple round trips and ensures consistent state.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { canRequestLeaderboard } from '@/lib/project-permissions';

// DEV MODE: Skip authentication in development
const DEV_MODE = process.env.NODE_ENV === 'development';

// =============================================================================
// TYPES
// =============================================================================

type CtaStateResponse =
  | {
      ok: true;
      arcAccessLevel: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
      arcActive: boolean;
      existingRequest: { id: string; status: 'pending' | 'approved' | 'rejected' } | null;
      shouldShowRequestButton: boolean;
      reason?: string;
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

async function getCurrentUser(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string) {
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

  return { userId: session.user_id };
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
      console.error('[CTA State API] Error checking akari_user_roles:', rolesError);
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
      return false;
    }

    if (xIdentity?.username) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('real_roles')
        .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
        .single();

      if (profileError) {
        return false;
      }

      if (profile?.real_roles?.includes('super_admin')) {
        return true;
      }
    }

    return false;
  } catch (err: any) {
    console.error('[CTA State API] Error in checkSuperAdmin:', err);
    return false;
  }
}

async function getUserProjectRole(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  projectId: string
): Promise<'owner' | 'admin' | 'moderator' | null> {
  try {
    // Check if user is project owner
    const { data: project } = await supabase
      .from('projects')
      .select('claimed_by')
      .eq('id', projectId)
      .single();

    if (project?.claimed_by === userId) {
      return 'owner';
    }

    // Get user's Twitter username
    const { data: xIdentity } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .single();

    if (!xIdentity?.username) {
      return null;
    }

    // Get profile ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
      .single();

    if (!profile) {
      return null;
    }

    // Check project_team_members for admin or moderator role
    const { data: teamMembers } = await supabase
      .from('project_team_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('profile_id', profile.id)
      .in('role', ['admin', 'moderator']);

    if (teamMembers && teamMembers.length > 0) {
      const roles = teamMembers.map(m => m.role);
      return roles.includes('admin') ? 'admin' : 'moderator';
    }

    return null;
  } catch (err: any) {
    console.error('[CTA State API] Error getting user project role:', err);
    return null;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CtaStateResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { projectId } = req.query;
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ ok: false, error: 'projectId is required' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get ARC project state
    const { data: projectData } = await supabase
      .from('projects')
      .select('arc_access_level, arc_active')
      .eq('id', projectId)
      .single();

    const arcAccessLevel: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' =
      projectData?.arc_access_level || 'none';
    const arcActive = projectData?.arc_active ?? false;

    // Get existing request (only if ARC not enabled)
    let existingRequest: { id: string; status: 'pending' | 'approved' | 'rejected' } | null = null;
    if (arcAccessLevel === 'none' && !arcActive) {
      const sessionToken = getSessionToken(req);
      if (sessionToken) {
        const currentUser = await getCurrentUser(supabase, sessionToken);
        if (currentUser) {
          // Get user's Twitter username to find profile
          const { data: xIdentity } = await supabase
            .from('akari_user_identities')
            .select('username')
            .eq('user_id', currentUser.userId)
            .eq('provider', 'x')
            .single();

          if (xIdentity?.username) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id')
              .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
              .single();

            if (profile) {
              const { data: requests } = await supabase
                .from('arc_leaderboard_requests')
                .select('id, status')
                .eq('project_id', projectId)
                .eq('requested_by', profile.id)
                .in('status', ['pending', 'approved', 'rejected'])
                .order('created_at', { ascending: false })
                .limit(1);

              if (requests && requests.length > 0) {
                existingRequest = {
                  id: requests[0].id,
                  status: requests[0].status,
                };
              }
            }
          }
        }
      }
    }

    // Check if user can request (permission check)
    let shouldShowRequestButton = false;
    let reason: string | undefined;

    // DEV MODE: Always allow in development
    if (DEV_MODE) {
      shouldShowRequestButton = arcAccessLevel === 'none' && !arcActive && !existingRequest;
      reason = DEV_MODE ? 'DEV_MODE: allowed' : undefined;
    } else {
      const sessionToken = getSessionToken(req);
      if (!sessionToken) {
        reason = 'Not logged in';
      } else {
        const currentUser = await getCurrentUser(supabase, sessionToken);
        if (!currentUser) {
          reason = 'Invalid session';
        } else {
          // Check superadmin
          const isSuperAdmin = await checkSuperAdmin(supabase, currentUser.userId);
          if (isSuperAdmin) {
            shouldShowRequestButton = arcAccessLevel === 'none' && !arcActive && !existingRequest;
            reason = shouldShowRequestButton ? 'Superadmin' : arcActive ? 'ARC already active' : existingRequest ? 'Existing request' : 'ARC enabled';
          } else {
            // Check team role (owner/admin/moderator)
            const teamRole = await getUserProjectRole(supabase, currentUser.userId, projectId);
            if (teamRole) {
              shouldShowRequestButton = arcAccessLevel === 'none' && !arcActive && !existingRequest;
              reason = shouldShowRequestButton ? `Team role: ${teamRole}` : arcActive ? 'ARC already active' : existingRequest ? 'Existing request' : 'ARC enabled';
            } else {
              // Check permission API
              const canRequest = await canRequestLeaderboard(supabase, currentUser.userId, projectId);
              if (canRequest) {
                shouldShowRequestButton = arcAccessLevel === 'none' && !arcActive && !existingRequest;
                reason = shouldShowRequestButton ? 'Permission API allowed' : arcActive ? 'ARC already active' : existingRequest ? 'Existing request' : 'ARC enabled';
              } else {
                reason = 'No permission';
              }
            }
          }
        }
      }
    }

    return res.status(200).json({
      ok: true,
      arcAccessLevel,
      arcActive,
      existingRequest,
      shouldShowRequestButton,
      reason,
    });
  } catch (error: any) {
    console.error('[CTA State API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

