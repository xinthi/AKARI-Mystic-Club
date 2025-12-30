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
  code: 'not_approved' | 'option_locked' | 'project_not_found';
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

  if (!isUnlocked) {
    return {
      ok: false,
      error: `ARC Option ${option} is not unlocked for this project`,
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

