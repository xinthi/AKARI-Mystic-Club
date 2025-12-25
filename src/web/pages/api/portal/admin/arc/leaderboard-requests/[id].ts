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
  start_at?: string;
  end_at?: string;
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
    const { status, arc_access_level, start_at, end_at } = req.body as Partial<UpdateRequestPayload>;

    if (!status || (status !== 'approved' && status !== 'rejected')) {
      return res.status(400).json({
        ok: false,
        error: 'status must be "approved" or "rejected"',
      });
    }

    // Validate dates if provided
    if (status === 'approved' && start_at && end_at) {
      const startDate = new Date(start_at);
      const endDate = new Date(end_at);

      if (isNaN(startDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'start_at must be a valid date',
        });
      }

      if (isNaN(endDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'end_at must be a valid date',
        });
      }

      if (endDate <= startDate) {
        return res.status(400).json({
          ok: false,
          error: 'end_at must be after start_at',
        });
      }
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
    // 4. Create billing record with pricing
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
      // Check if a row exists for this project (any status)
      const { data: existingAccessRows, error: checkError } = await supabase
        .from('arc_project_access')
        .select('id, application_status')
        .eq('project_id', request.project_id);

      if (checkError) {
        console.error('[Admin Leaderboard Request Update API] Error checking existing access:', checkError);
      }

      const accessData: any = {
        project_id: request.project_id,
        application_status: 'approved' as const,
        approved_at: new Date().toISOString(),
        approved_by: adminProfile.profileId,
      };

      let accessError: any = null;
      if (existingAccessRows && existingAccessRows.length > 0) {
        // Update all existing rows for this project to approved
        // This ensures consistency even if multiple rows exist
        const { error: updateError } = await supabase
          .from('arc_project_access')
          .update({
            application_status: 'approved' as const,
            approved_at: new Date().toISOString(),
            approved_by: adminProfile.profileId,
          })
          .eq('project_id', request.project_id);

        accessError = updateError;
      } else {
        // Insert new row if none exists
        const { error: insertError } = await supabase
          .from('arc_project_access')
          .insert(accessData);

        accessError = insertError;
      }

      if (accessError) {
        console.error('[Admin Leaderboard Request Update API] Error updating arc_project_access:', accessError);
        console.error('[Admin Leaderboard Request Update API] Access data:', JSON.stringify(accessData, null, 2));
        // Continue - don't fail the request, but log the error
      } else {
        console.log('[Admin Leaderboard Request Update API] Successfully updated arc_project_access for project:', request.project_id);
      }

      // Step 3: Create/update arc_project_features with option unlocks and dates
      // Map arc_access_level to option unlocks and module enablement:
      // - creator_manager -> option1_crm_unlocked = true, crm_enabled = true, crm_start_at, crm_end_at
      // - leaderboard -> option2_normal_unlocked = true, leaderboard_enabled = true, leaderboard_start_at, leaderboard_end_at
      // - gamified -> option3_gamified_unlocked = true, gamefi_enabled = true, gamefi_start_at, gamefi_end_at
      const featuresData: any = {
        project_id: request.project_id,
      };

      if (arc_access_level === 'creator_manager') {
        featuresData.option1_crm_unlocked = true;
        featuresData.crm_enabled = true;
        if (start_at && end_at) {
          featuresData.crm_start_at = new Date(start_at).toISOString();
          featuresData.crm_end_at = new Date(end_at).toISOString();
        }
        // If dates are not provided, leave them as null - module will be always active
      } else if (arc_access_level === 'leaderboard') {
        featuresData.option2_normal_unlocked = true;
        featuresData.leaderboard_enabled = true;
        if (start_at && end_at) {
          featuresData.leaderboard_start_at = new Date(start_at).toISOString();
          featuresData.leaderboard_end_at = new Date(end_at).toISOString();
        }
        // If dates are not provided, leave them as null - module will be always active
      } else if (arc_access_level === 'gamified') {
        featuresData.option3_gamified_unlocked = true;
        featuresData.gamefi_enabled = true;
        if (start_at && end_at) {
          featuresData.gamefi_start_at = new Date(start_at).toISOString();
          featuresData.gamefi_end_at = new Date(end_at).toISOString();
        }
        // If dates are not provided, leave them as null - module will be always active
      }

      // Upsert arc_project_features (this table has UNIQUE constraint on project_id, so upsert works)
      const { error: featuresError } = await supabase
        .from('arc_project_features')
        .upsert(featuresData, {
          onConflict: 'project_id',
        });

      if (featuresError) {
        console.error('[Admin Leaderboard Request Update API] Error updating arc_project_features:', featuresError);
        console.error('[Admin Leaderboard Request Update API] Features data:', JSON.stringify(featuresData, null, 2));
        // Continue - don't fail the request, but log the error
      } else {
        console.log('[Admin Leaderboard Request Update API] Successfully updated arc_project_features for project:', request.project_id);
      }

      // Step 4: Create billing record with pricing
      try {
        // Get current pricing for this access level
        const { data: pricing, error: pricingError } = await supabase
          .from('arc_pricing')
          .select('base_price_usd, currency')
          .eq('access_level', arc_access_level)
          .eq('is_active', true)
          .single();

        if (pricingError) {
          console.error('[Admin Leaderboard Request Update API] Error fetching pricing:', pricingError);
          // Continue without billing record if pricing not found (table might not exist yet)
        } else if (pricing) {
          const basePrice = Number(pricing.base_price_usd || 0);
          const discountPercent = 0; // Can be added later for discounts
          const finalPrice = basePrice * (1 - discountPercent / 100);

          // Create billing record
          const { error: billingError } = await supabase
            .from('arc_billing_records')
            .insert({
              request_id: id,
              project_id: request.project_id,
              access_level: arc_access_level,
              base_price_usd: basePrice,
              discount_percent: discountPercent,
              final_price_usd: finalPrice,
              currency: pricing.currency || 'USD',
              payment_status: 'pending', // Default to pending, can be updated later
              created_by: adminProfile.profileId,
            });

          if (billingError) {
            console.error('[Admin Leaderboard Request Update API] Error creating billing record:', billingError);
            // Continue - don't fail approval if billing record creation fails
          } else {
            console.log('[Admin Leaderboard Request Update API] Successfully created billing record for request:', id, 'price:', finalPrice);
          }
        }
      } catch (billingErr: any) {
        // Catch any unexpected errors in billing logic - never fail approval
        console.error('[Admin Leaderboard Request Update API] Unexpected error in billing creation:', billingErr);
      }

      // Step 5: Auto-create/activate arena for leaderboard access levels (required for Live/Upcoming visibility)
      // Both 'leaderboard' and 'gamified' need arenas to show in live leaderboards section
      if (arc_access_level === 'leaderboard' || arc_access_level === 'gamified') {
        try {
          // Check if arena already exists for this project
          const { data: existingArenas, error: arenaCheckError } = await supabase
            .from('arenas')
            .select('id, status, slug, starts_at, ends_at')
            .eq('project_id', request.project_id)
            .order('created_at', { ascending: false });

          if (arenaCheckError) {
            console.error('[Admin Leaderboard Request Update API] Error checking existing arenas:', arenaCheckError);
            // Continue - don't fail approval
          }

          const existingArena = existingArenas && existingArenas.length > 0 ? existingArenas[0] : null;

          if (!existingArena) {
            // Get project name and slug for arena naming
            const { data: project, error: projectFetchError } = await supabase
              .from('projects')
              .select('name, slug')
              .eq('id', request.project_id)
              .single();

            if (projectFetchError || !project) {
              console.error('[Admin Leaderboard Request Update API] Error fetching project for arena creation:', projectFetchError);
              // Continue - don't fail the request
            } else {
              // Generate stable arena slug with numeric suffix if needed
              // Use different base slugs for different access levels
              const baseSlugName = arc_access_level === 'gamified' ? 'gamified' : 'leaderboard';
              let baseSlug = `${project.slug}-${baseSlugName}`;
              let arenaSlug = baseSlug;
              let suffix = 2;

              // Check if base slug exists and find next available
              const { data: slugCheck } = await supabase
                .from('arenas')
                .select('slug')
                .eq('slug', arenaSlug)
                .maybeSingle();

              if (slugCheck) {
                // Base slug exists, find next available numeric suffix
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

              // Generate appropriate arena name
              const arenaName = arc_access_level === 'gamified' 
                ? `${project.name} Gamified Leaderboard`
                : `${project.name} Leaderboard`;

              // Always create arena with status 'active' (API will use dates to determine Live vs Upcoming)
              const { error: arenaError } = await supabase
                .from('arenas')
                .insert({
                  project_id: request.project_id,
                  name: arenaName,
                  slug: arenaSlug,
                  status: 'active',
                  starts_at: start_at ? new Date(start_at).toISOString() : null,
                  ends_at: end_at ? new Date(end_at).toISOString() : null,
                  created_by: adminProfile.profileId,
                });

              if (arenaError) {
                console.error('[Admin Leaderboard Request Update API] Error creating arena:', arenaError);
                console.error('[Admin Leaderboard Request Update API] Arena creation data:', {
                  project_id: request.project_id,
                  name: arenaName,
                  slug: arenaSlug,
                  status: 'active',
                  starts_at: start_at ? new Date(start_at).toISOString() : null,
                  ends_at: end_at ? new Date(end_at).toISOString() : null,
                });
                // Continue - don't fail the request, but log the error
              } else {
                console.log('[Admin Leaderboard Request Update API] Successfully created arena for project:', request.project_id, 'slug:', arenaSlug, 'name:', arenaName);
                
                // Regression guard: verify arena was created and is accessible
                const { data: verifyArena, error: verifyError } = await supabase
                  .from('arenas')
                  .select('id, status, project_id, name, slug')
                  .eq('project_id', request.project_id)
                  .eq('status', 'active')
                  .order('created_at', { ascending: false })
                  .limit(1);
                
                if (verifyError) {
                  console.error(`[Admin Leaderboard Request Update API] REGRESSION GUARD ERROR: Failed to verify arena creation:`, verifyError);
                } else if (!verifyArena || verifyArena.length === 0) {
                  console.error(`[Admin Leaderboard Request Update API] REGRESSION GUARD FAILED: Project ${request.project_id} approved but no active arena found after creation attempt!`);
                } else {
                  console.log(`[Admin Leaderboard Request Update API] REGRESSION GUARD PASSED: Arena ${verifyArena[0].id} verified for project ${request.project_id}`);
                }
              }
            }
          } else {
            // Arena exists - check status before re-activating
            // Only re-activate if status is 'paused' - NEVER re-activate 'ended' arenas
            if (existingArena.status === 'ended') {
              console.log(`[Admin Leaderboard Request Update API] Arena ${existingArena.id} is already ended. Cannot re-activate ended arenas. Skipping arena update.`);
              // Still update dates if provided (for reference, but don't change status)
              if (start_at || end_at) {
                const dateUpdateData: any = {};
                if (start_at) {
                  dateUpdateData.starts_at = new Date(start_at).toISOString();
                }
                if (end_at) {
                  dateUpdateData.ends_at = new Date(end_at).toISOString();
                }
                const { error: dateUpdateError } = await supabase
                  .from('arenas')
                  .update(dateUpdateData)
                  .eq('id', existingArena.id);
                if (dateUpdateError) {
                  console.error('[Admin Leaderboard Request Update API] Error updating dates for ended arena:', dateUpdateError);
                }
              }
            } else if (existingArena.status === 'paused' || existingArena.status === 'cancelled') {
              // Re-activate paused or cancelled arenas
              const updateData: any = {
                status: 'active',
              };

              // Update dates if provided in approval (avoid stale dates)
              if (start_at) {
                updateData.starts_at = new Date(start_at).toISOString();
              }
              if (end_at) {
                updateData.ends_at = new Date(end_at).toISOString();
              }

              const { error: arenaUpdateError } = await supabase
                .from('arenas')
                .update(updateData)
                .eq('id', existingArena.id);

              if (arenaUpdateError) {
                console.error('[Admin Leaderboard Request Update API] Error updating existing arena:', arenaUpdateError);
              } else {
                console.log(`[Admin Leaderboard Request Update API] Successfully re-activated arena from ${existingArena.status} to active:`, existingArena.id);
              }
            } else {
              // Arena is already active or scheduled - just update dates if provided
              const updateData: any = {};
              if (start_at) {
                updateData.starts_at = new Date(start_at).toISOString();
              }
              if (end_at) {
                updateData.ends_at = new Date(end_at).toISOString();
              }
              if (Object.keys(updateData).length > 0) {
                const { error: arenaUpdateError } = await supabase
                  .from('arenas')
                  .update(updateData)
                  .eq('id', existingArena.id);
                if (arenaUpdateError) {
                  console.error('[Admin Leaderboard Request Update API] Error updating dates for active arena:', arenaUpdateError);
                }
              }
            }
          }
        } catch (arenaErr: any) {
          // Catch any unexpected errors in arena logic - never fail approval
          console.error('[Admin Leaderboard Request Update API] Unexpected error in arena creation/activation:', arenaErr);
        }
      }

      // Step 6: Regression guards for all option types
      // Get project slug for better error messages
      const { data: projectForSlug } = await supabase
        .from('projects')
        .select('slug')
        .eq('id', request.project_id)
        .single();

      const projectSlug = projectForSlug?.slug || request.project_id;

      // Regression guard: Option 1 (CRM) - Check if campaign exists
      if (arc_access_level === 'creator_manager') {
        const { data: campaigns, error: campaignsCheckError } = await supabase
          .from('arc_campaigns')
          .select('id')
          .eq('project_id', request.project_id)
          .in('status', ['live', 'paused'])
          .limit(1);

        if (campaignsCheckError) {
          console.error(`[Admin Leaderboard Request Update API] REGRESSION GUARD ERROR: Failed to check campaigns for project ${projectSlug} (${request.project_id}):`, campaignsCheckError);
        } else if (!campaigns || campaigns.length === 0) {
          console.error(`[Admin Leaderboard Request Update API] REGRESSION GUARD WARNING: Project ${projectSlug} (${request.project_id}) approved for Option 1 (CRM) but no live/paused campaigns found. Campaigns must be created manually. Request ID: ${request.id}`);
        }
      }

      // Regression guard: Option 3 (Gamified) - Check if quest exists or arena is linked
      if (arc_access_level === 'gamified') {
        const { data: quests, error: questsCheckError } = await supabase
          .from('arc_quests')
          .select('id')
          .eq('project_id', request.project_id)
          .in('status', ['active', 'paused'])
          .limit(1);

        const { data: gamifiedArenas, error: arenasCheckError } = await supabase
          .from('arenas')
          .select('id')
          .eq('project_id', request.project_id)
          .in('status', ['active', 'scheduled'])
          .limit(1);

        if (questsCheckError || arenasCheckError) {
          console.error(`[Admin Leaderboard Request Update API] REGRESSION GUARD ERROR: Failed to check gamified items for project ${projectSlug} (${request.project_id}):`, questsCheckError || arenasCheckError);
        } else if ((!quests || quests.length === 0) && (!gamifiedArenas || gamifiedArenas.length === 0)) {
          console.error(`[Admin Leaderboard Request Update API] REGRESSION GUARD WARNING: Project ${projectSlug} (${request.project_id}) approved for Option 3 (Gamified) but no active quests or arenas found. Request ID: ${request.id}`);
        }
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

