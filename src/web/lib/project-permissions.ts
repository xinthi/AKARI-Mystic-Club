/**
 * Project Permissions Helper
 * 
 * Utilities for checking project-level permissions using:
 * - project_team_members.role (owner, admin, moderator, investor_view)
 * - profiles.real_roles (user, creator, project_admin, super_admin, institutional)
 * - akari_user_roles (for global roles)
 * 
 * This replaces/additional to the existing permission system for project-specific access.
 */

import { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

export type ProjectTeamRole = 'owner' | 'admin' | 'moderator' | 'investor_view';
export type ProfileRealRole = 'user' | 'creator' | 'project_admin' | 'super_admin' | 'institutional';

export interface ProjectPermissionCheck {
  canManage: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  isInvestorView: boolean;
  isSuperAdmin: boolean;
  hasProjectAdminRole: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get user's Twitter username from akari_user_identities
 */
async function getUserTwitterUsername(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  let { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', userId)
    .in('provider', ['x', 'twitter'])
    .maybeSingle();

  if (!xIdentity?.username) {
    const { data: fallbackIdentity } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .not('username', 'is', null)
      .maybeSingle();
    xIdentity = fallbackIdentity || xIdentity;
  }

  return xIdentity?.username ? xIdentity.username.toLowerCase().replace('@', '').trim() : null;
}

/**
 * Get profile ID from Twitter username
 */
async function getProfileIdFromUsername(
  supabase: SupabaseClient,
  username: string
): Promise<string | null> {
  let { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username.toLowerCase().replace('@', '').trim())
    .maybeSingle();

  if (!profile) {
    const { data: profileFallback } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', username.toLowerCase().replace('@', '').trim())
      .maybeSingle();
    profile = profileFallback || profile;
  }

  return profile?.id || null;
}

/**
 * Check if user is super admin
 */
async function isSuperAdmin(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data: roles } = await supabase
    .from('akari_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');

  return (roles?.length ?? 0) > 0;
}

/**
 * Check project permissions for a user
 * 
 * @param supabase - Supabase client
 * @param userId - akari_users.id
 * @param projectId - projects.id
 * @returns Permission check result
 */
export async function checkProjectPermissions(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<ProjectPermissionCheck> {
  const result: ProjectPermissionCheck = {
    canManage: false,
    isOwner: false,
    isAdmin: false,
    isModerator: false,
    isInvestorView: false,
    isSuperAdmin: false,
    hasProjectAdminRole: false,
  };

  // Check if user is super admin
  result.isSuperAdmin = await isSuperAdmin(supabase, userId);
  if (result.isSuperAdmin) {
    result.canManage = true; // Super admin can manage everything
  }

  // Get project
  const { data: project } = await supabase
    .from('projects')
    .select('claimed_by')
    .eq('id', projectId)
    .single();

  if (!project) {
    return result;
  }

  // Check if user is the project owner
  result.isOwner = project.claimed_by === userId;
  if (result.isOwner) {
    result.canManage = true;
  }

  // Get user's Twitter username
  const twitterUsername = await getUserTwitterUsername(supabase, userId);
  if (!twitterUsername) {
    return result; // No Twitter account linked
  }

  // Get profile ID
  const profileId = await getProfileIdFromUsername(supabase, twitterUsername);
  if (!profileId) {
    return result; // Profile not found
  }

  // Check project_team_members roles
  const { data: teamMembers } = await supabase
    .from('project_team_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('profile_id', profileId);

  if (teamMembers) {
    const roles = teamMembers.map(m => m.role as ProjectTeamRole);
    result.isAdmin = roles.includes('admin');
    result.isModerator = roles.includes('moderator');
    result.isInvestorView = roles.includes('investor_view');

    if (result.isAdmin || result.isOwner) {
      result.canManage = true;
    }
  }

  // Check profiles.real_roles
  const { data: profile } = await supabase
    .from('profiles')
    .select('real_roles')
    .eq('id', profileId)
    .single();

  if (profile?.real_roles) {
    result.hasProjectAdminRole = profile.real_roles.includes('project_admin');
    if (result.hasProjectAdminRole) {
      result.canManage = true;
    }
  }

  // Note: akari_user_roles does not support 'project_admin' role
  // Only profiles.real_roles supports 'project_admin' as a global elevated role

  return result;
}

/**
 * Check if user can manage a specific project
 * Shorthand for checkProjectPermissions().canManage
 */
export async function canManageProject(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<boolean> {
  const permissions = await checkProjectPermissions(supabase, userId, projectId);
  return permissions.canManage;
}

/**
 * Check if user is project owner or admin
 */
export async function isProjectOwnerOrAdmin(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<boolean> {
  const permissions = await checkProjectPermissions(supabase, userId, projectId);
  return permissions.isOwner || permissions.isAdmin || permissions.isSuperAdmin;
}

/**
 * Check if user can request ARC leaderboard for a project
 * 
 * Allowed if user is:
 * - Project owner (claimed_by === userId)
 * - Project admin (project_team_members.role = 'admin')
 * - Project moderator (project_team_members.role = 'moderator')
 * - Super Admin
 * 
 * @param supabase - Supabase client
 * @param userId - akari_users.id
 * @param projectId - projects.id
 * @returns true if user can request leaderboard
 */
export async function canRequestLeaderboard(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<boolean> {
  const permissions = await checkProjectPermissions(supabase, userId, projectId);
  
  // Super admin can always request
  if (permissions.isSuperAdmin) {
    return true;
  }
  
  // Owner, admin, or moderator can request
  return permissions.isOwner || permissions.isAdmin || permissions.isModerator;
}

