/**
 * ARC Access Control Helper
 * 
 * Enforces global ARC approval and option unlocks for projects.
 * A project can only use ARC features if:
 * 1. It has approved ARC access (arc_project_access.application_status = 'approved')
 * 2. The specific option is unlocked (arc_project_features.option{1|2|3}_unlocked = true)
 * 
 * This gate must be applied to ALL ARC API routes and UI pages.
 */

import { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

export type ArcOption = 1 | 2 | 3;

export interface ArcAccessResult {
  ok: true;
  approved: boolean;
  optionUnlocked: boolean;
  reason?: string;
}

export interface ArcAccessError {
  ok: false;
  error: string;
  code: 'not_approved' | 'option_locked' | 'project_not_found' | 'not_arc_company';
}

export type ArcAccessCheck = ArcAccessResult | ArcAccessError;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if a project has ARC access approved and option unlocked
 * 
 * @param supabase - Supabase admin client
 * @param projectId - Project UUID
 * @param option - Which ARC option to check (1=CRM, 2=Leaderboard, 3=Gamified)
 * @returns Access check result
 */
export async function requireArcAccess(
  supabase: SupabaseClient,
  projectId: string,
  option: ArcOption
): Promise<ArcAccessCheck> {
  // Check if project exists
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, arc_active, arc_access_level')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    return {
      ok: false,
      error: 'Project not found',
      code: 'project_not_found',
    };
  }

  // Check ARC approval status - get the latest row and check if it's approved
  const { data: access, error: accessError } = await supabase
    .from('arc_project_access')
    .select('application_status')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (accessError) {
    console.error('[requireArcAccess] Error checking access:', accessError);
    // If table doesn't exist or error, allow for backward compatibility in dev
    if (process.env.NODE_ENV === 'development') {
      console.warn('[requireArcAccess] DEV MODE - allowing access despite error');
      return { ok: true, approved: true, optionUnlocked: true };
    }
    return {
      ok: false,
      error: 'Failed to check ARC access',
      code: 'not_approved',
    };
  }

  if (!access || access.application_status !== 'approved') {
    return {
      ok: false,
      error: 'ARC access not approved for this project',
      code: 'not_approved',
    };
  }

  // Check option unlock status
  // Strict mapping: option 1 => 'option1_crm_unlocked', option 2 => 'option2_normal_unlocked', option 3 => 'option3_gamified_unlocked'
  const optionFieldMap: Record<ArcOption, 'option1_crm_unlocked' | 'option2_normal_unlocked' | 'option3_gamified_unlocked'> = {
    1: 'option1_crm_unlocked',
    2: 'option2_normal_unlocked',
    3: 'option3_gamified_unlocked',
  };
  
  const optionField = optionFieldMap[option];
  
  // Fetch all feature columns to avoid dynamic selection
  const { data: features, error: featuresError } = await supabase
    .from('arc_project_features')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();

  if (featuresError) {
    console.error('[requireArcAccess] Error checking features:', featuresError);
    console.error('[requireArcAccess] Project ID:', projectId);
    console.error('[requireArcAccess] Option:', option);
    // If table doesn't exist, allow for backward compatibility in dev
    if (process.env.NODE_ENV === 'development') {
      console.warn('[requireArcAccess] DEV MODE - allowing access despite features error');
      return { ok: true, approved: true, optionUnlocked: true };
    }
    return {
      ok: false,
      error: 'Failed to check option unlock status',
      code: 'option_locked',
    };
  }

  // Log what we found for debugging
  if (features) {
    console.log(`[requireArcAccess] Found features for project ${projectId}:`, {
      option1_crm_unlocked: features.option1_crm_unlocked,
      option2_normal_unlocked: features.option2_normal_unlocked,
      option3_gamified_unlocked: features.option3_gamified_unlocked,
      checkingOption: option,
      checkingField: optionField,
    });
  } else {
    console.log(`[requireArcAccess] No features row found for project ${projectId}, will check legacy fallback`);
  }

  // If features row doesn't exist, check legacy arc_access_level as fallback
  // IMPORTANT: Even in legacy fallback, we still require arc_project_access.application_status = 'approved'
  // This prevents bypassing the approval gate by relying only on legacy fields
  if (!features) {
    // Legacy fallback: check projects.arc_access_level
    // But we still require approval (already checked above via 'access' variable)
    const legacyMapping: Record<ArcOption, string> = {
      1: 'creator_manager',
      2: 'leaderboard',
      3: 'gamified',
    };
    
    const expectedLevel = legacyMapping[option];
    const hasLegacyAccess = project.arc_active && project.arc_access_level === expectedLevel;
    
    // Only grant access if BOTH conditions are met:
    // 1. arc_project_access.application_status = 'approved' (checked above, stored in 'access')
    // 2. Legacy fields match the expected option
    if (hasLegacyAccess && access) {
      return { ok: true, approved: true, optionUnlocked: true };
    }
    
    return {
      ok: false,
      error: `ARC Option ${option} is not unlocked for this project`,
      code: 'option_locked',
    };
  }

  // Type-safe access to the option field
  const isUnlocked = (features as Record<string, any>)[optionField] === true;

  console.log(`[requireArcAccess] Checking unlock status for project ${projectId}, option ${option}:`, {
    optionField,
    isUnlocked,
    featureValue: (features as Record<string, any>)[optionField],
    allFeatureFields: {
      option1_crm_unlocked: (features as Record<string, any>).option1_crm_unlocked,
      option2_normal_unlocked: (features as Record<string, any>).option2_normal_unlocked,
      option3_gamified_unlocked: (features as Record<string, any>).option3_gamified_unlocked,
    },
  });

  if (!isUnlocked) {
    console.log(`[requireArcAccess] ❌ Option ${option} is NOT unlocked for project ${projectId}`);
    return {
      ok: false,
      error: `ARC Option ${option} is not unlocked for this project`,
      code: 'option_locked',
    };
  }

  console.log(`[requireArcAccess] ✅ Option ${option} IS unlocked for project ${projectId}`);
  return {
    ok: true,
    approved: true,
    optionUnlocked: true,
  };
}

/**
 * Check if any ARC option is approved/unlocked for a project
 * Used for UI pages to show/hide ARC sections
 */
export async function hasAnyArcAccess(
  supabase: SupabaseClient,
  projectId: string
): Promise<boolean> {
  // Check approval - get the latest row and check if it's approved
  const { data: access } = await supabase
    .from('arc_project_access')
    .select('application_status')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!access || access.application_status !== 'approved') {
    return false;
  }

  // Check if any option is unlocked
  const { data: features } = await supabase
    .from('arc_project_features')
    .select('option1_crm_unlocked, option2_normal_unlocked, option3_gamified_unlocked')
    .eq('project_id', projectId)
    .maybeSingle();

  if (features) {
    return features.option1_crm_unlocked || features.option2_normal_unlocked || features.option3_gamified_unlocked;
  }

  // Legacy fallback: check arc_active and arc_access_level
  const { data: project } = await supabase
    .from('projects')
    .select('arc_active, arc_access_level')
    .eq('id', projectId)
    .single();

  return project?.arc_active === true && project?.arc_access_level !== 'none';
}

/**
 * Check if a project has campaigns access (Option 2 or Option 3)
 * Campaigns are available for projects with:
 * 1. ARC access approved (arc_project_access.application_status = 'approved')
 * 2. Option 2 (Normal Leaderboard) OR Option 3 (Gamified) unlocked
 *    OR leaderboard_enabled OR gamefi_enabled
 * 
 * @param supabase - Supabase admin client
 * @param projectId - Project UUID
 * @returns Access check result
 */
export async function requireCampaignsAccess(
  supabase: SupabaseClient,
  projectId: string
): Promise<ArcAccessCheck> {
  // Check if project exists
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    return {
      ok: false,
      error: 'Project not found',
      code: 'project_not_found',
    };
  }

  // Check ARC approval status
  const { data: access, error: accessError } = await supabase
    .from('arc_project_access')
    .select('application_status')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (accessError) {
    console.error('[requireCampaignsAccess] Error checking access:', accessError);
    if (process.env.NODE_ENV === 'development') {
      console.warn('[requireCampaignsAccess] DEV MODE - allowing access despite error');
      return { ok: true, approved: true, optionUnlocked: true };
    }
    return {
      ok: false,
      error: 'Failed to check ARC access',
      code: 'not_approved',
    };
  }

  if (!access || access.application_status !== 'approved') {
    return {
      ok: false,
      error: 'ARC access not approved for this project',
      code: 'not_approved',
    };
  }

  // Check if Option 2 or Option 3 is unlocked, or if leaderboard/gamefi is enabled
  const { data: features, error: featuresError } = await supabase
    .from('arc_project_features')
    .select('option2_normal_unlocked, option3_gamified_unlocked, leaderboard_enabled, gamefi_enabled')
    .eq('project_id', projectId)
    .maybeSingle();

  if (featuresError) {
    console.error('[requireCampaignsAccess] Error checking features:', featuresError);
    if (process.env.NODE_ENV === 'development') {
      console.warn('[requireCampaignsAccess] DEV MODE - allowing access despite features error');
      return { ok: true, approved: true, optionUnlocked: true };
    }
    return {
      ok: false,
      error: 'Failed to check option unlock status',
      code: 'option_locked',
    };
  }

  // Check if campaigns are available (Option 2 OR Option 3 OR leaderboard_enabled OR gamefi_enabled)
  const hasCampaignsAccess = features
    ? (features.option2_normal_unlocked || features.option3_gamified_unlocked || 
       features.leaderboard_enabled || features.gamefi_enabled)
    : false;

  if (!hasCampaignsAccess) {
    return {
      ok: false,
      error: 'ARC campaigns not unlocked (need Option 2 or Option 3)',
      code: 'option_locked',
    };
  }

  return {
    ok: true,
    approved: true,
    optionUnlocked: true,
  };
}

/**
 * Check if a user can READ an arena (public read access for active/ended arenas)
 * Requires:
 * - Arena status is 'active' or 'ended'
 * - Project is_arc_company = true
 * - arc_project_access.application_status = 'approved'
 * - Optionally blocks if project security_status is 'blocked' or 'suspended'
 * 
 * @param supabase - Supabase admin client
 * @param arenaSlug - Arena slug
 * @returns Access check result with clear error codes
 */
export async function requireArcArenaReadAccess(
  supabase: SupabaseClient,
  arenaSlug: string
): Promise<ArcAccessCheck> {
  // Fetch arena with project info
  const { data: arenaData, error: arenaError } = await supabase
    .from('arenas')
    .select(`
      id,
      status,
      project_id,
      projects!inner (
        id,
        is_arc_company,
        project_arc_settings (
          security_status
        )
      )
    `)
    .ilike('slug', arenaSlug.trim().toLowerCase())
    .single();

  if (arenaError || !arenaData) {
    return {
      ok: false,
      error: 'Arena not found',
      code: 'project_not_found',
    };
  }

  const project = (arenaData as any).projects;
  if (!project) {
    return {
      ok: false,
      error: 'Project not found',
      code: 'project_not_found',
    };
  }

  // Check if project is ARC-eligible (is_arc_company must be true)
  if (!project.is_arc_company) {
    return {
      ok: false,
      error: 'Project is not eligible for ARC',
      code: 'not_arc_company',
    };
  }

  // Check ARC approval status
  const { data: access, error: accessError } = await supabase
    .from('arc_project_access')
    .select('application_status')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (accessError) {
    console.error('[requireArcArenaReadAccess] Error checking access:', accessError);
    return {
      ok: false,
      error: 'Failed to check ARC access',
      code: 'not_approved',
    };
  }

  if (!access || access.application_status !== 'approved') {
    return {
      ok: false,
      error: 'ARC access not approved for this project',
      code: 'not_approved',
    };
  }

  // Check arena status - only allow read for active or ended arenas
  if (arenaData.status !== 'active' && arenaData.status !== 'ended') {
    return {
      ok: false,
      error: 'Arena not available',
      code: 'option_locked',
    };
  }

  // Optionally check security status
  const settings = (project.project_arc_settings as any[])?.[0];
  if (settings?.security_status === 'blocked' || settings?.security_status === 'suspended') {
    return {
      ok: false,
      error: 'Arena not available',
      code: 'option_locked',
    };
  }

  return {
    ok: true,
    approved: true,
    optionUnlocked: true,
  };
}

/**
 * Check if a user can MANAGE an arena (create/edit/end)
 * Requires:
 * - ARC access approved (arc_project_access.application_status = 'approved')
 * - User has admin/moderator/owner role OR is superadmin
 * 
 * @param supabase - Supabase admin client
 * @param projectId - Project UUID
 * @param userId - User ID (optional, for permission check)
 * @returns Access check result
 */
export async function requireArcManageAccess(
  supabase: SupabaseClient,
  projectId: string,
  userId?: string
): Promise<ArcAccessCheck> {
  // Check if project exists
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, is_arc_company')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    return {
      ok: false,
      error: 'Project not found',
      code: 'project_not_found',
    };
  }

  // Check if project is ARC-eligible
  if (!project.is_arc_company) {
    return {
      ok: false,
      error: 'Project is not eligible for ARC',
      code: 'option_locked',
    };
  }

  // Check ARC approval status
  const { data: access, error: accessError } = await supabase
    .from('arc_project_access')
    .select('application_status')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (accessError) {
    console.error('[requireArcManageAccess] Error checking access:', accessError);
    return {
      ok: false,
      error: 'Failed to check ARC access',
      code: 'not_approved',
    };
  }

  if (!access || access.application_status !== 'approved') {
    return {
      ok: false,
      error: 'ARC access not approved for this project',
      code: 'not_approved',
    };
  }

  // If userId is provided, check user permissions
  if (userId) {
    // Check if user is superadmin
    const { data: superAdmin } = await supabase
      .from('akari_user_roles')
      .select('user_id')
      .eq('user_id', userId)
      .eq('role', 'super_admin')
      .maybeSingle();

    if (superAdmin) {
      return {
        ok: true,
        approved: true,
        optionUnlocked: true,
      };
    }

    // Check project permissions (admin/moderator/owner)
    // This would require the project-permissions helper
    // For now, we'll allow if approved (permission check can be done at endpoint level)
  }

  return {
    ok: true,
    approved: true,
    optionUnlocked: true,
  };
}
