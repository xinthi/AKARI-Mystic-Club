/**
 * Profile Search and Creation Permissions
 * 
 * Helper functions for tier-based permissions when searching/adding new profiles.
 */

import type { AkariUser } from './permissions';
import { isSuperAdmin } from './permissions';
import { getUserTier, type UserTier } from './userTier';

export type ProfileType = 'company' | 'personal';

/**
 * Check if user can search/add new profiles
 * Only institutional_plus and superadmin can add new profiles
 */
export function canSearchNewProfiles(user: AkariUser | null): boolean {
  if (!user || !user.isLoggedIn) {
    return false;
  }

  // SuperAdmin can always search/add
  if (isSuperAdmin(user)) {
    return true;
  }

  const tier = getUserTier(user);
  
  // Only institutional_plus can search/add new profiles
  return tier === 'institutional_plus';
}

/**
 * Get allowed profile types for a user tier
 * Returns empty array if user cannot add profiles
 */
export function allowedNewProfileTypes(user: AkariUser | null): ProfileType[] {
  if (!user || !user.isLoggedIn) {
    return [];
  }

  // SuperAdmin can add both types
  if (isSuperAdmin(user)) {
    return ['company', 'personal'];
  }

  const tier = getUserTier(user);
  
  // institutional_plus can only add company/project profiles
  if (tier === 'institutional_plus') {
    return ['company'];
  }

  // seer and analyst cannot add new profiles
  return [];
}

/**
 * Map frontend profile type to database profile_type value
 */
export function mapProfileTypeToDb(profileType: ProfileType): 'project' | 'personal' {
  // 'company' maps to 'project' in the database
  // 'personal' maps to 'personal' in the database
  return profileType === 'company' ? 'project' : 'personal';
}

/**
 * Map database profile_type to frontend profile type
 */
export function mapDbProfileTypeToFrontend(profileType: 'project' | 'personal' | null): ProfileType | null {
  if (profileType === null) return null;
  return profileType === 'project' ? 'company' : 'personal';
}

