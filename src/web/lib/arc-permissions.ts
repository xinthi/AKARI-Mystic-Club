/**
 * ARC Permissions Helper
 * 
 * Utilities for checking ARC-specific permissions:
 * - Project approval status
 * - Feature unlock status (Option 1, 2, 3)
 * - Campaign access permissions
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase-admin';
import { checkProjectPermissions } from './project-permissions';

// =============================================================================
// TYPES
// =============================================================================

export interface ArcProjectAccessStatus {
  hasAccess: boolean;
  isApproved: boolean;
  isPending: boolean;
  isRejected: boolean;
  requestedOptions?: string[];
  approvedOptions?: string[];
}

export interface ArcFeatureUnlockStatus {
  option1_crm_unlocked: boolean;
  option2_normal_unlocked: boolean;
  option3_gamified_unlocked: boolean;
  unlocked_at: string | null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a project has ARC approval
 */
export async function checkArcProjectApproval(
  supabase: SupabaseClient,
  projectId: string
): Promise<ArcProjectAccessStatus> {
  const result: ArcProjectAccessStatus = {
    hasAccess: false,
    isApproved: false,
    isPending: false,
    isRejected: false,
  };

  // Check approval status
  const { data: access } = await supabase
    .from('arc_project_access')
    .select('application_status')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!access) {
    return result; // No request yet
  }

  result.isApproved = access.application_status === 'approved';
  result.isPending = access.application_status === 'pending';
  result.isRejected = access.application_status === 'rejected';
  result.hasAccess = result.isApproved;

  return result;
}

/**
 * Check if a project has a specific ARC option unlocked
 */
export async function checkArcFeatureUnlock(
  supabase: SupabaseClient,
  projectId: string,
  option: 'option1_crm' | 'option2_normal' | 'option3_gamified'
): Promise<boolean> {
  const { data: features } = await supabase
    .from('arc_project_features')
    .select(`${option}_unlocked`)
    .eq('project_id', projectId)
    .single();

  if (!features) {
    return false;
  }

  const fieldName = `${option}_unlocked` as keyof typeof features;
  return features[fieldName] === true;
}

/**
 * Get all feature unlock statuses for a project
 */
export async function getArcFeatureUnlockStatus(
  supabase: SupabaseClient,
  projectId: string
): Promise<ArcFeatureUnlockStatus | null> {
  const { data: features } = await supabase
    .from('arc_project_features')
    .select('option1_crm_unlocked, option2_normal_unlocked, option3_gamified_unlocked, unlocked_at')
    .eq('project_id', projectId)
    .single();

  if (!features) {
    return null;
  }

  return {
    option1_crm_unlocked: features.option1_crm_unlocked || false,
    option2_normal_unlocked: features.option2_normal_unlocked || false,
    option3_gamified_unlocked: features.option3_gamified_unlocked || false,
    unlocked_at: features.unlocked_at || null,
  };
}

/**
 * Verify that a project can use a specific ARC option
 * Checks both approval and unlock status
 */
export async function verifyArcOptionAccess(
  supabase: SupabaseClient,
  projectId: string,
  option: 'option1_crm' | 'option2_normal' | 'option3_gamified'
): Promise<{ allowed: boolean; reason?: string }> {
  // Check approval
  const approval = await checkArcProjectApproval(supabase, projectId);
  if (!approval.isApproved) {
    return {
      allowed: false,
      reason: approval.isPending
        ? 'ARC access is pending approval'
        : approval.isRejected
        ? 'ARC access was rejected'
        : 'ARC access has not been approved',
    };
  }

  // Check unlock status
  const isUnlocked = await checkArcFeatureUnlock(supabase, projectId, option);
  if (!isUnlocked) {
    return {
      allowed: false,
      reason: `${option} has not been unlocked for this project`,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can apply for ARC access
 * User must be project owner/admin/moderator OR official X account
 */
export async function canApplyForArcAccess(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<boolean> {
  // Check project permissions
  const permissions = await checkProjectPermissions(supabase, userId, projectId);
  
  // Super admin can always apply
  if (permissions.isSuperAdmin) {
    return true;
  }

  // Owner, admin, or moderator can apply
  return permissions.isOwner || permissions.isAdmin || permissions.isModerator;
}

/**
 * Get profile ID from user ID (via Twitter username)
 */
export async function getProfileIdFromUserId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  // Get Twitter username
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
    .eq('username', xIdentity.username.toLowerCase().replace('@', '').trim())
    .single();

  return profile?.id || null;
}




