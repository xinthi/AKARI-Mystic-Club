/**
 * API Route: PUT /api/portal/admin/arc/leaderboard-requests/[requestId]/approve
 * 
 * Approve a leaderboard request and set up project features.
 * Super admin only.
 * 
 * v1 sequential; v2 wrap in SQL function transaction
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isSuperAdminServerSide } from '@/lib/server-auth';

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
 * Extract session token from request cookies
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

    if (new Date(session.expires_at) < new Date()) {
      await supabase.from('akari_user_sessions').delete().eq('session_token', sessionToken);
      return null;
    }

    return session.user_id;
  } catch (err) {
    return null;
  }
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
  // Only allow PUT requests
  if (req.method !== 'PUT') {
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
      error: 'Not authenticated',
    });
  }

  const userId = await getUserIdFromSession(sessionToken);
  if (!userId) {
    return res.status(401).json({
      ok: false,
      error: 'Invalid session',
    });
  }

  // Check super admin
  const isSuperAdmin = await isSuperAdminServerSide(userId);
  if (!isSuperAdmin) {
    return res.status(403).json({
      ok: false,
      error: 'SuperAdmin only',
    });
  }

  const { requestId } = req.query;

  // Validate requestId is a UUID
  if (!requestId || typeof requestId !== 'string' || !isValidUUID(requestId)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid request ID',
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    // Get admin profile ID
    const adminProfileId = await getProfileIdFromUserId(supabase, userId);
    if (!adminProfileId) {
      return res.status(401).json({
        ok: false,
        error: 'Admin profile not found',
      });
    }

    // Step 1: Load request by id
    const { data: request, error: requestError } = await supabase
      .from('arc_leaderboard_requests')
      .select('id, project_id, product_type, start_at, end_at, status')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      console.error('[Approve Request API] Error fetching request:', requestError);
      
      // Check if error is due to missing columns
      if (requestError?.code === '42703' || requestError?.message?.includes('column') || requestError?.message?.includes('does not exist')) {
        return res.status(500).json({
          ok: false,
          error: 'Database schema error: arc_leaderboard_requests table is missing required columns (product_type, start_at, end_at). Please run migrations.',
        });
      }
      
      return res.status(404).json({
        ok: false,
        error: 'request_not_found',
      });
    }

    // Validate request is pending
    if (request.status !== 'pending') {
      return res.status(400).json({
        ok: false,
        error: 'request_not_pending',
      });
    }

    const productType = request.product_type;
    const projectId = request.project_id;
    const startAt = request.start_at;
    const endAt = request.end_at;

    // Validate product_type exists (new field might not be in table yet)
    if (!productType || !['ms', 'gamefi', 'crm'].includes(productType)) {
      return res.status(400).json({
        ok: false,
        error: 'Request missing product_type or invalid product_type. Please ensure the request was created with the new API.',
      });
    }

    // Step 2: Update request status to "approved"
    const { error: updateRequestError } = await supabase
      .from('arc_leaderboard_requests')
      .update({
        status: 'approved',
        decided_at: now,
        decided_by: adminProfileId,
      })
      .eq('id', requestId);

    if (updateRequestError) {
      console.error('[Approve Request API] Error updating request:', updateRequestError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to update request status',
      });
    }

    // Step 3: Upsert arc_project_access
    const { data: existingAccess, error: checkAccessError } = await supabase
      .from('arc_project_access')
      .select('id')
      .eq('project_id', projectId)
      .maybeSingle();

    const accessData: any = {
      project_id: projectId,
      application_status: 'approved',
      approved_at: now,
      approved_by_profile_id: adminProfileId,
    };

    let accessError: any = null;
    if (existingAccess) {
      const { error: updateAccessError } = await supabase
        .from('arc_project_access')
        .update(accessData)
        .eq('project_id', projectId);
      accessError = updateAccessError;
    } else {
      const { error: insertAccessError } = await supabase
        .from('arc_project_access')
        .insert(accessData);
      accessError = insertAccessError;
    }

    if (accessError) {
      console.error('[Approve Request API] Error upserting arc_project_access:', accessError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to update project access',
      });
    }

    // Step 4: Upsert arc_project_features
    const featuresData: any = {
      project_id: projectId,
    };

    // Map product_type to feature flags
    if (productType === 'ms') {
      featuresData.leaderboard_enabled = true;
      if (startAt && endAt) {
        featuresData.leaderboard_start_at = startAt;
        featuresData.leaderboard_end_at = endAt;
      }
      // Also unlock option2 for backward compatibility
      featuresData.option2_normal_unlocked = true;
    } else if (productType === 'gamefi') {
      featuresData.gamefi_enabled = true;
      if (startAt && endAt) {
        featuresData.gamefi_start_at = startAt;
        featuresData.gamefi_end_at = endAt;
      }
      // Also unlock option3 for backward compatibility
      featuresData.option3_gamified_unlocked = true;
      // Gamefi also needs leaderboard base
      featuresData.leaderboard_enabled = true;
      featuresData.option2_normal_unlocked = true;
      if (startAt && endAt) {
        featuresData.leaderboard_start_at = startAt;
        featuresData.leaderboard_end_at = endAt;
      }
    } else if (productType === 'crm') {
      featuresData.crm_enabled = true;
      if (startAt && endAt) {
        featuresData.crm_start_at = startAt;
        featuresData.crm_end_at = endAt;
      }
      // Set default visibility if not set
      featuresData.crm_visibility = 'private';
      // Also unlock option1 for backward compatibility
      featuresData.option1_crm_unlocked = true;
    }

    const { error: featuresError } = await supabase
      .from('arc_project_features')
      .upsert(featuresData, {
        onConflict: 'project_id',
      });

    if (featuresError) {
      console.error('[Approve Request API] Error upserting arc_project_features:', featuresError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to update project features',
      });
    }

    // Step 5: Entity creation
    let createdArenaId: string | undefined;

    if (productType === 'ms' || productType === 'gamefi') {
      // End any existing active MS/legacy_ms arenas for this project first
      const { error: endOthersError } = await supabase
        .from('arenas')
        .update({
          status: 'ended',
          ends_at: now,
          updated_at: now,
        })
        .eq('project_id', projectId)
        .eq('status', 'active')
        .in('kind', ['ms', 'legacy_ms']);

      if (endOthersError) {
        console.error('[Approve Request API] Error ending existing arenas:', endOthersError);
        // Continue - don't fail approval, but log the error
      }

      // Fetch project for arena name/slug
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, name, slug')
        .eq('id', projectId)
        .single();

      if (projectError || !project) {
        console.error('[Approve Request API] Error fetching project:', projectError);
        return res.status(500).json({
          ok: false,
          error: 'Failed to fetch project',
        });
      }

      // Generate unique arena slug
      const projectSlug = project.slug || project.id.substring(0, 8);
      let baseSlug = `${projectSlug}-leaderboard`;
      let arenaSlug = baseSlug;
      let suffix = 2;

      // Check if slug exists and find next available
      const { data: slugCheck } = await supabase
        .from('arenas')
        .select('slug')
        .eq('slug', arenaSlug)
        .maybeSingle();

      if (slugCheck) {
        while (true) {
          arenaSlug = `${baseSlug}-${suffix}`;
          const { data: nextCheck } = await supabase
            .from('arenas')
            .select('slug')
            .eq('slug', arenaSlug)
            .maybeSingle();
          if (!nextCheck) break;
          suffix++;
        }
      }

      const arenaName = `${project.name} Mindshare`;

      const arenaData: any = {
        project_id: projectId,
        kind: 'ms',
        status: 'active',
        name: arenaName,
        slug: arenaSlug,
        starts_at: startAt || null,
        ends_at: endAt || null,
        created_by: adminProfileId,
      };

      const { data: createdArena, error: arenaError } = await supabase
        .from('arenas')
        .insert(arenaData)
        .select('id')
        .single();

      if (arenaError) {
        console.error('[Approve Request API] Error creating arena:', arenaError);
        return res.status(500).json({
          ok: false,
          error: 'Failed to create arena',
        });
      }

      if (createdArena) {
        createdArenaId = createdArena.id;
      }
    } else if (productType === 'crm') {
      // v1: Just enable feature flags (campaign creation can be done separately)
      // Check if arc_campaigns table exists by trying to query it
      const { error: campaignsTableError } = await supabase
        .from('arc_campaigns')
        .select('id')
        .limit(0);

      if (!campaignsTableError) {
        // Table exists - could create a campaign here if needed
        // For v1, just enable features and return
      }
    }

    // Step 6: Billing record (optional if table exists)
    let billingSkipped = false;
    try {
      // Try to insert billing record
      // Map product_type to access_level for billing
      let accessLevel: string;
      if (productType === 'ms') {
        accessLevel = 'leaderboard';
      } else if (productType === 'gamefi') {
        accessLevel = 'gamified';
      } else {
        accessLevel = 'creator_manager';
      }

      // Get pricing
      const { data: pricing, error: pricingError } = await supabase
        .from('arc_pricing')
        .select('base_price_usd, currency')
        .eq('access_level', accessLevel)
        .eq('is_active', true)
        .maybeSingle();

      if (pricingError) {
        // Table might not exist - skip billing
        if (pricingError.code === '42P01' || pricingError.message?.includes('does not exist')) {
          billingSkipped = true;
        } else {
          console.error('[Approve Request API] Error fetching pricing:', pricingError);
        }
      } else if (pricing) {
        const basePrice = Number(pricing.base_price_usd || 0);
        const finalPrice = basePrice; // No discount for now

        const billingData: any = {
          request_id: requestId,
          project_id: projectId,
          access_level: accessLevel,
          base_price_usd: basePrice,
          discount_percent: 0,
          final_price_usd: finalPrice,
          currency: pricing.currency || 'USD',
          payment_status: 'pending',
          created_by: adminProfileId,
        };

        const { error: billingError } = await supabase
          .from('arc_billing_records')
          .insert(billingData);

        if (billingError) {
          // Table might not exist - skip billing
          if (billingError.code === '42P01' || billingError.message?.includes('does not exist')) {
            billingSkipped = true;
          } else {
            console.error('[Approve Request API] Error creating billing record:', billingError);
            // Continue - don't fail approval if billing fails
          }
        }
      }
    } catch (billingErr: any) {
      // Table doesn't exist - skip billing
      if (billingErr.code === '42P01' || billingErr.message?.includes('does not exist')) {
        billingSkipped = true;
      } else {
        console.error('[Approve Request API] Unexpected error in billing:', billingErr);
      }
    }

    const response: ApproveRequestResponse = {
      ok: true,
      requestId,
      projectId,
      productType,
      created: {
        ...(createdArenaId && { arenaId: createdArenaId }),
      },
      ...(billingSkipped && {
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
