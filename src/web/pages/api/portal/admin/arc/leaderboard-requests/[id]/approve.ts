/**
 * API Route: POST|PUT /api/portal/admin/arc/leaderboard-requests/[id]/approve
 * 
 * Approve a leaderboard request and set up project features.
 * Super admin only.
 * 
 * Accepts both POST and PUT methods (treated the same).
 * 
 * v1 sequential; v2 wrap in SQL function transaction
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/server/require-superadmin';

// =============================================================================
// TYPES
// =============================================================================

type ApproveRequestResponse =
  | {
      ok: true;
      requestId: string;
      projectId: string;
      productType: string;
      created: {
        arenaId?: string;
      };
      billing?: {
        skipped_no_table?: boolean;
      };
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Validate UUID format
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

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

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApproveRequestResponse>
) {
  // Only allow POST and PUT requests (treat them the same)
  if (req.method !== 'POST' && req.method !== 'PUT') {
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

  const { id: requestId } = req.query;

  // Validate requestId is a UUID
  if (!requestId || typeof requestId !== 'string' || !isValidUUID(requestId)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid request ID',
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

    // Call RPC function to handle approval in a single transaction
    const { data: result, error: rpcError } = await supabase.rpc(
      'arc_admin_approve_leaderboard_request',
      {
        p_request_id: requestId,
        p_admin_profile_id: adminProfileId,
      }
    );

    if (rpcError) {
      console.error('[Approve Request API] RPC error:', rpcError);

      // Map RPC errors to HTTP status codes
      const errorMessage = rpcError.message || rpcError.details || 'Unknown error';
      
      if (errorMessage.includes('request_not_found')) {
        return res.status(404).json({
          ok: false,
          error: 'request_not_found',
        });
      }
      
      if (errorMessage.includes('request_not_pending')) {
        return res.status(400).json({
          ok: false,
          error: 'request_not_pending',
        });
      }

      // Other errors (invalid_product_type, project_not_found, etc.)
      return res.status(500).json({
        ok: false,
        error: errorMessage,
      });
    }

    if (!result || !result.ok) {
      return res.status(500).json({
        ok: false,
        error: result?.error || 'Approval failed',
      });
    }

    // Transform RPC result to match API response format
    const response: ApproveRequestResponse = {
      ok: true,
      requestId: result.requestId,
      projectId: result.projectId,
      productType: result.productType,
      created: {
        ...(result.created?.arenaId && { arenaId: result.created.arenaId }),
      },
      ...(result.billingInserted === false && {
        billing: {
          skipped_no_table: true,
        },
      }),
    };

    return res.status(200).json(response);
  } catch (error: any) {
    console.error('[Approve Request API] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
