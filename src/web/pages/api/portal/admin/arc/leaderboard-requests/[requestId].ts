/**
 * API Route: PATCH /api/portal/admin/arc/leaderboard-requests/[requestId]
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
  start_at?: string;
  end_at?: string;
  discount_percent?: number;
  discount_notes?: string;
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

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Check if user is Super Admin
 */
async function isSuperAdminServerSide(userId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();

    // Check akari_user_roles table
    const { data: userRoles, error: rolesError } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin');

    if (rolesError) {
      console.error('[isSuperAdminServerSide] Error checking akari_user_roles:', rolesError);
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
      console.error('[isSuperAdminServerSide] Error checking akari_user_identities:', identityError);
      return false;
    }

    if (xIdentity?.username) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('real_roles')
        .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
        .single();

      if (profileError) {
        console.error('[isSuperAdminServerSide] Error checking profiles:', profileError);
        return false;
      }

      if (profile?.real_roles?.includes('super_admin')) {
        return true;
      }
    }

    return false;
  } catch (err: any) {
    console.error('[isSuperAdminServerSide] Error:', err);
    return false;
  }
}

/**
 * Get session token from request cookies
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

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      // Clean up expired session
      await supabase
        .from('akari_user_sessions')
        .delete()
        .eq('session_token', sessionToken);
      return null;
    }

    return session.user_id;
  } catch (err) {
    console.error('[getUserIdFromSession] Error:', err);
    return null;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdateRequestResponse>
) {
  // Only allow PATCH requests
  if (req.method !== 'PATCH') {
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
      error: 'not_authenticated',
    });
  }

  const userId = await getUserIdFromSession(sessionToken);
  if (!userId) {
    return res.status(401).json({
      ok: false,
      error: 'not_authenticated',
    });
  }

  // Check SuperAdmin status
  const isSuperAdmin = await isSuperAdminServerSide(userId);
  if (!isSuperAdmin) {
    return res.status(403).json({
      ok: false,
      error: 'superadmin_only',
    });
  }

  // Get requestId from query
  const { requestId } = req.query;

  if (!requestId || typeof requestId !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Invalid request ID',
    });
  }

  // Parse request body
  let body: UpdateRequestPayload;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid request body',
    });
  }

  if (!body.status || !['approved', 'rejected'].includes(body.status)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid status. Must be "approved" or "rejected"',
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Fetch the request
    const { data: request, error: requestError } = await supabase
      .from('arc_leaderboard_requests')
      .select('id, project_id, status, requested_by')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      return res.status(404).json({
        ok: false,
        error: 'Request not found',
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        ok: false,
        error: `Request is already ${request.status}`,
      });
    }

    // Update request status
    const updateData: any = {
      status: body.status,
      decided_by: userId,
      decided_at: new Date().toISOString(),
    };

    // If approved, update project access
    if (body.status === 'approved') {
      // Update project access level if provided
      if (body.arc_access_level) {
        const { error: projectError } = await supabase
          .from('projects')
          .update({
            arc_active: true,
            arc_access_level: body.arc_access_level,
          })
          .eq('id', request.project_id);

        if (projectError) {
          console.error('[Update Request API] Error updating project:', projectError);
          return res.status(500).json({
            ok: false,
            error: 'Failed to update project access',
          });
        }
      }

      // Update arc_project_features if dates provided
      if (body.start_at || body.end_at) {
        const featuresData: any = {
          project_id: request.project_id,
        };

        if (body.start_at) {
          featuresData.leaderboard_start_at = body.start_at;
        }
        if (body.end_at) {
          featuresData.leaderboard_end_at = body.end_at;
        }
        if (body.arc_access_level === 'leaderboard') {
          featuresData.leaderboard_enabled = true;
        } else if (body.arc_access_level === 'gamified') {
          featuresData.gamefi_enabled = true;
          featuresData.leaderboard_enabled = true;
        } else if (body.arc_access_level === 'creator_manager') {
          featuresData.crm_enabled = true;
        }

        const { error: featuresError } = await supabase
          .from('arc_project_features')
          .upsert(featuresData, {
            onConflict: 'project_id',
          });

        if (featuresError) {
          console.error('[Update Request API] Error updating features:', featuresError);
          // Don't fail the request, just log the error
        }
      }
    }

    // Update the request
    const { data: updatedRequest, error: updateError } = await supabase
      .from('arc_leaderboard_requests')
      .update(updateData)
      .eq('id', requestId)
      .select('id, status, decided_by, decided_at')
      .single();

    if (updateError || !updatedRequest) {
      console.error('[Update Request API] Error updating request:', updateError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to update request',
      });
    }

    // Fetch updated project info
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, arc_active, arc_access_level')
      .eq('id', request.project_id)
      .single();

    // Send notification to requester if approved
    if (body.status === 'approved' && request.requested_by) {
      try {
        await createNotification(
          supabase,
          request.requested_by,
          'arc_request_approved',
          {
            requestId: requestId,
            projectId: request.project_id,
          }
        );
      } catch (notifError) {
        console.error('[Update Request API] Error creating notification:', notifError);
        // Don't fail the request if notification fails
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
      project: {
        id: project?.id || request.project_id,
        arc_active: project?.arc_active || false,
        arc_access_level: project?.arc_access_level || null,
      },
    });
  } catch (error: any) {
    console.error('[Update Request API] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
