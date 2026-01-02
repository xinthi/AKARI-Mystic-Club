/**
 * API Route: POST /api/portal/admin/arc/verify-approval
 * 
 * Verification endpoint for testing approval flow end-to-end.
 * Super admin only.
 * 
 * Takes a projectId, finds latest pending request, approves it via RPC,
 * and returns all verification data.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/server/require-superadmin';

// =============================================================================
// TYPES
// =============================================================================

type VerifyApprovalResponse =
  | {
      ok: true;
      rpcResult: any;
      verification: {
        request: {
          id: string;
          status: string;
          decided_at: string | null;
        };
        projectAccess: {
          application_status: string;
          approved_at: string | null;
          approved_by_profile_id: string | null;
        } | null;
        projectFeatures: {
          leaderboard_enabled: boolean | null;
          gamefi_enabled: boolean | null;
          crm_enabled: boolean | null;
          updated_at: string | null;
        } | null;
        arena: {
          id: string;
          kind: string;
          status: string;
          name: string | null;
        } | null;
      };
    }
  | {
      ok: false;
      error: string;
      rpcError?: {
        code?: string;
        message?: string;
        details?: string;
        hint?: string;
      };
    };

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get profile ID from user ID
 */
async function getProfileIdFromUserId(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<string | null> {
  try {
    const { data: xIdentity, error: identityError } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .single();

    if (identityError || !xIdentity?.username) {
      return null;
    }

    const cleanUsername = xIdentity.username.toLowerCase().replace('@', '').trim();
    
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (profileError || !profile) {
      return null;
    }

    return profile.id;
  } catch (err) {
    return null;
  }
}

/**
 * Validate UUID format
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VerifyApprovalResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  // Check authentication and SuperAdmin status
  const auth = await requireSuperAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({
      ok: false,
      error: auth.error,
    });
  }

  const { projectId } = req.body;

  // Validate projectId is a UUID
  if (!projectId || typeof projectId !== 'string' || !isValidUUID(projectId)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid projectId. Must be a valid UUID.',
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get admin profile ID
    const adminProfileId = await getProfileIdFromUserId(supabase, auth.profileId);
    if (!adminProfileId) {
      return res.status(401).json({
        ok: false,
        error: 'Admin profile not found',
      });
    }

    // Find latest pending request for this project
    const { data: pendingRequests, error: requestsError } = await supabase
      .from('arc_leaderboard_requests')
      .select('id, project_id, product_type, status')
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    if (requestsError) {
      return res.status(500).json({
        ok: false,
        error: `Failed to fetch pending requests: ${requestsError.message}`,
      });
    }

    if (!pendingRequests || pendingRequests.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'No pending leaderboard request found for this project',
      });
    }

    const requestId = pendingRequests[0].id;

    // Call RPC function to approve
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'arc_admin_approve_leaderboard_request',
      {
        p_request_id: requestId,
        p_admin_profile_id: adminProfileId,
      }
    );

    if (rpcError) {
      return res.status(500).json({
        ok: false,
        error: rpcError.message || 'RPC call failed',
        rpcError: {
          code: rpcError.code,
          message: rpcError.message,
          details: rpcError.details,
          hint: rpcError.hint,
        },
      });
    }

    if (!rpcResult || !rpcResult.ok) {
      return res.status(500).json({
        ok: false,
        error: rpcResult?.error || 'Approval failed',
      });
    }

    // Fetch verification data
    const [requestData, projectAccessData, projectFeaturesData, arenaData] = await Promise.all([
      // Request status
      supabase
        .from('arc_leaderboard_requests')
        .select('id, status, decided_at')
        .eq('id', requestId)
        .single(),
      
      // Project access
      supabase
        .from('arc_project_access')
        .select('application_status, approved_at, approved_by_profile_id')
        .eq('project_id', projectId)
        .maybeSingle(),
      
      // Project features
      supabase
        .from('arc_project_features')
        .select('leaderboard_enabled, gamefi_enabled, crm_enabled, updated_at')
        .eq('project_id', projectId)
        .maybeSingle(),
      
      // Newest arena (if ms/gamefi)
      supabase
        .from('arenas')
        .select('id, kind, status, name')
        .eq('project_id', projectId)
        .in('kind', ['ms', 'legacy_ms'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return res.status(200).json({
      ok: true,
      rpcResult,
      verification: {
        request: {
          id: requestData.data?.id || requestId,
          status: requestData.data?.status || 'unknown',
          decided_at: requestData.data?.decided_at || null,
        },
        projectAccess: projectAccessData.data ? {
          application_status: projectAccessData.data.application_status,
          approved_at: projectAccessData.data.approved_at,
          approved_by_profile_id: projectAccessData.data.approved_by_profile_id,
        } : null,
        projectFeatures: projectFeaturesData.data ? {
          leaderboard_enabled: projectFeaturesData.data.leaderboard_enabled,
          gamefi_enabled: projectFeaturesData.data.gamefi_enabled,
          crm_enabled: projectFeaturesData.data.crm_enabled,
          updated_at: projectFeaturesData.data.updated_at,
        } : null,
        arena: arenaData.data ? {
          id: arenaData.data.id,
          kind: arenaData.data.kind,
          status: arenaData.data.status,
          name: arenaData.data.name,
        } : null,
      },
    });
  } catch (error: any) {
    console.error('[Verify Approval API] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
