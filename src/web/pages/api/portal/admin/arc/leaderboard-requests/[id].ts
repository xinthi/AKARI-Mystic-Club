/**
 * API Route: PATCH /api/portal/admin/arc/leaderboard-requests/[id]
 * 
 * Approve or reject an ARC leaderboard request (super admin only).
 * When approved, sets project.arc_active=true and project.arc_access_level accordingly.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications';

// =============================================================================
// TYPES
// =============================================================================

interface UpdateRequestPayload {
  status: 'approved' | 'rejected';
  arc_access_level?: 'leaderboard' | 'gamified' | 'creator_manager';
}

type UpdateRequestResponse =
  | {
      ok: true;
      request: {
        id: string;
        status: 'approved' | 'rejected';
        decided_by: string | null;
        decided_at: string | null;
      };
      project: {
        id: string;
        arc_active: boolean;
        arc_access_level: string | null;
      };
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
      console.error('[Admin Leaderboard Request Update API] Error checking akari_user_roles:', rolesError);
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
      console.error('[Admin Leaderboard Request Update API] Error checking akari_user_identities:', identityError);
      return false;
    }

    if (xIdentity?.username) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('real_roles')
        .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
        .single();

      if (profileError) {
        console.error('[Admin Leaderboard Request Update API] Error checking profiles:', profileError);
        return false;
      }

      if (profile?.real_roles?.includes('super_admin')) {
        return true;
      }
    }

    return false;
  } catch (err: any) {
    console.error('[Admin Leaderboard Request Update API] Error in checkSuperAdmin:', err);
    return false;
  }
}

async function getCurrentUserProfile(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string): Promise<{ profileId: string } | null> {
  const { data: session, error: sessionError } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (sessionError || !session) {
    console.error('[Admin Leaderboard Request Update API] Session lookup failed:', sessionError?.message || 'No session');
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    console.error('[Admin Leaderboard Request Update API] Session expired');
    return null;
  }

  // Get user's Twitter username to find profile
  const { data: xIdentity, error: identityError } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', session.user_id)
    .eq('provider', 'x')
    .single();

  if (identityError || !xIdentity?.username) {
    console.error('[Admin Leaderboard Request Update API] X identity lookup failed:', identityError?.message || 'No X identity');
    return null;
  }

  const cleanUsername = xIdentity.username.toLowerCase().replace('@', '').trim();
  
  // Try exact match first
  let { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('username', cleanUsername)
    .single();

  // If not found, try case-insensitive search (in case username format differs)
  if (!profile && profileError?.code === 'PGRST116') {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', cleanUsername);
    
    if (profiles && profiles.length > 0) {
      profile = profiles[0];
      console.log(`[Admin Leaderboard Request Update API] Found profile with case-insensitive match: ${profiles[0].username} (looking for: ${cleanUsername})`);
    }
  }

  if (!profile) {
    console.error(`[Admin Leaderboard Request Update API] Profile not found for username: ${cleanUsername} (from X identity: ${xIdentity.username})`);
    return null;
  }

  return {
    profileId: profile.id,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdateRequestResponse>
) {
  // Only allow PATCH
  if (req.method !== 'PATCH') {
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

    // Get current user's profile (for decided_by)
    const adminProfile = await getCurrentUserProfile(supabase, sessionToken);
    if (!adminProfile) {
      return res.status(401).json({ 
        ok: false, 
        error: 'Your Twitter profile is not tracked in the system. Please track your profile first using the Sentiment page before approving requests.' 
      });
    }

    // Get request ID from query
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Request ID is required' });
    }

    // Fetch the request to get project_id, requested_by, and current status (check status before validating body)
    const { data: request, error: requestError } = await supabase
      .from('arc_leaderboard_requests')
      .select('id, project_id, requested_by, status')
      .eq('id', id)
      .single();

    if (requestError || !request) {
      return res.status(404).json({ ok: false, error: 'Request not found' });
    }

    // Parse and validate request body
    const { status, arc_access_level } = req.body as Partial<UpdateRequestPayload>;

    if (!status || (status !== 'approved' && status !== 'rejected')) {
      return res.status(400).json({
        ok: false,
        error: 'status must be "approved" or "rejected"',
      });
    }

    // Defensive check: ensure request is in pending status before updating
    if (request.status !== 'pending') {
      return res.status(400).json({
        ok: false,
        error: `Cannot update request that is already ${request.status}`,
      });
    }

    // If approved, arc_access_level is required
    if (status === 'approved' && !arc_access_level) {
      return res.status(400).json({
        ok: false,
        error: 'arc_access_level is required when approving (must be "leaderboard", "gamified", or "creator_manager")',
      });
    }

    // Defensive check: ensure arc_access_level is valid if provided
    if (status === 'approved' && arc_access_level && !['leaderboard', 'gamified', 'creator_manager'].includes(arc_access_level)) {
      return res.status(400).json({
        ok: false,
        error: 'arc_access_level must be "leaderboard", "gamified", or "creator_manager"',
      });
    }

    // Update request status
    const updateData: any = {
      status,
      decided_by: adminProfile.profileId,
      decided_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('arc_leaderboard_requests')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.error('[Admin Leaderboard Request Update API] Error updating request:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to update request' });
    }

    // If approved, update project ARC settings using new access gate system
    // 1. Update projects.arc_active and projects.arc_access_level (legacy support)
    // 2. Create/update arc_project_access with application_status='approved'
    // 3. Create/update arc_project_features with appropriate option unlocks
    let updatedProject = null;
    if (status === 'approved' && arc_access_level) {
      // Step 1: Update legacy project fields
      const projectUpdateData: any = {
        arc_active: true,
        arc_access_level: arc_access_level,
      };

      const { data: projectData, error: projectUpdateError } = await supabase
        .from('projects')
        .update(projectUpdateData)
        .eq('id', request.project_id)
        .select('id, arc_active, arc_access_level')
        .single();

      if (projectUpdateError) {
        console.error('[Admin Leaderboard Request Update API] Error updating project:', projectUpdateError);
        console.warn('[Admin Leaderboard Request Update API] Request was updated but project update failed');
      }

      // Step 2: Create/update arc_project_access
      const accessData = {
        project_id: request.project_id,
        application_status: 'approved' as const,
        approved_at: new Date().toISOString(),
        approved_by: adminProfile.profileId,
      };

      // Upsert arc_project_access
      const { error: accessError } = await supabase
        .from('arc_project_access')
        .upsert(accessData, {
          onConflict: 'project_id',
        });

      if (accessError) {
        console.error('[Admin Leaderboard Request Update API] Error updating arc_project_access:', accessError);
        // Continue - don't fail the request
      }

      // Step 3: Create/update arc_project_features with option unlocks
      // Map arc_access_level to option unlocks:
      // - creator_manager -> option1_crm_unlocked = true
      // - leaderboard -> option2_normal_unlocked = true
      // - gamified -> option3_gamified_unlocked = true
      const featuresData: any = {
        project_id: request.project_id,
      };

      if (arc_access_level === 'creator_manager') {
        featuresData.option1_crm_unlocked = true;
      } else if (arc_access_level === 'leaderboard') {
        featuresData.option2_normal_unlocked = true;
      } else if (arc_access_level === 'gamified') {
        featuresData.option3_gamified_unlocked = true;
      }

      // Upsert arc_project_features
      const { error: featuresError } = await supabase
        .from('arc_project_features')
        .upsert(featuresData, {
          onConflict: 'project_id',
        });

      if (featuresError) {
        console.error('[Admin Leaderboard Request Update API] Error updating arc_project_features:', featuresError);
        // Continue - don't fail the request
      }

      if (projectData) {
        updatedProject = {
          id: projectData.id,
          arc_active: projectData.arc_active,
          arc_access_level: projectData.arc_access_level,
        };
      } else {
        // Fetch current project state to return
        const { data: currentProject } = await supabase
          .from('projects')
          .select('id, arc_active, arc_access_level')
          .eq('id', request.project_id)
          .single();
        if (currentProject) {
          updatedProject = {
            id: currentProject.id,
            arc_active: currentProject.arc_active,
            arc_access_level: currentProject.arc_access_level,
          };
        }
      }
    } else if (status === 'rejected') {
      // For rejected requests, fetch current project state (should not change)
      const { data: currentProject } = await supabase
        .from('projects')
        .select('id, arc_active, arc_access_level')
        .eq('id', request.project_id)
        .single();
      if (currentProject) {
        updatedProject = {
          id: currentProject.id,
          arc_active: currentProject.arc_active,
          arc_access_level: currentProject.arc_access_level,
        };
      }
    }

    // Fetch updated request
    const { data: updatedRequest, error: fetchError } = await supabase
      .from('arc_leaderboard_requests')
      .select('id, status, decided_by, decided_at')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[Admin Leaderboard Request Update API] Error fetching updated request:', fetchError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch updated request',
      });
    }

    if (!updatedRequest) {
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch updated request',
      });
    }

    if (!updatedProject) {
      // Fallback: return project with expected values
      updatedProject = {
        id: request.project_id,
        arc_active: status === 'approved' ? true : false,
        arc_access_level: status === 'approved' ? arc_access_level || null : null,
      };
    }

    // Create notification for the requester (idempotent: check if notification already exists)
    if (request.requested_by) {
      const notificationType = status === 'approved' 
        ? 'leaderboard_request_approved' 
        : 'leaderboard_request_rejected';
      
      // Check if notification already exists for this request (idempotent)
      // Fetch notifications of this type for this user and check if any have this requestId
      const { data: existingNotifications } = await supabase
        .from('notifications')
        .select('context')
        .eq('profile_id', request.requested_by)
        .eq('type', notificationType);
      
      // Check if any notification has this requestId in context
      const hasExistingNotification = existingNotifications?.some((notif: any) => 
        notif.context?.requestId === id
      );

      // Only create notification if it doesn't exist
      if (!hasExistingNotification) {
        await createNotification(
          supabase,
          request.requested_by,
          notificationType,
          {
            requestId: id,
            projectId: request.project_id,
            arc_access_level: status === 'approved' ? arc_access_level : null,
          }
        );
      }
    }

    return res.status(200).json({
      ok: true,
      request: {
        id: updatedRequest.id,
        status: updatedRequest.status as 'approved' | 'rejected',
        decided_by: updatedRequest.decided_by,
        decided_at: updatedRequest.decided_at,
      },
      project: updatedProject,
    });
  } catch (error: any) {
    console.error('[Admin Leaderboard Request Update API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

