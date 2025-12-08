/**
 * AKARI Mystic Club - Roles and Feature Permissions
 * 
 * This module defines the permission system for the website.
 * DO NOT modify MiniApp code or sentiment formulas.
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export type Role = 'user' | 'analyst' | 'admin' | 'super_admin';

export type FeatureKey = 
  | 'markets.view'
  | 'markets.compare'
  | 'markets.analytics'
  | 'sentiment.view_basic'
  | 'sentiment.search'
  | 'sentiment.compare'
  | 'launchpad.add_project'
  | string; // Allow custom feature keys

export interface FeatureGrant {
  id: string;
  featureKey: string;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface AkariUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  realRoles: Role[];
  effectiveRoles: Role[];
  featureGrants: FeatureGrant[];
  isLoggedIn: boolean;
  viewAsRole: Role | null;
  xUsername?: string;
}

// =============================================================================
// ROLE-FEATURE MAPPING
// =============================================================================

/**
 * Features granted automatically by each role.
 * Higher roles include all features of lower roles.
 */
const ROLE_FEATURES: Record<Role, FeatureKey[]> = {
  user: [
    'markets.view',
    'sentiment.view_basic',
  ],
  analyst: [
    'markets.view',
    'markets.compare',
    'markets.analytics',
    'sentiment.view_basic',
    'sentiment.search',
    'sentiment.compare',
  ],
  admin: [
    'markets.view',
    'markets.compare',
    'markets.analytics',
    'sentiment.view_basic',
    'sentiment.search',
    'sentiment.compare',
    'launchpad.add_project',
  ],
  super_admin: [], // Special case - has all features
};

// =============================================================================
// PERMISSION FUNCTIONS
// =============================================================================

/**
 * Check if a role implies (automatically grants) a specific feature.
 */
export function roleImpliesFeature(role: Role, featureKey: FeatureKey): boolean {
  // Super admin has all features
  if (role === 'super_admin') {
    return true;
  }

  return ROLE_FEATURES[role]?.includes(featureKey) ?? false;
}

/**
 * Check if a user can access a feature.
 * 
 * Returns true if:
 * - Any of the user's roles implies the feature via roleImpliesFeature
 * - OR the user has an active feature grant for that feature
 * 
 * @param user - The user object with roles and feature grants
 * @param featureKey - The feature to check
 * @param now - Current time (default: new Date())
 * @param useEffectiveRoles - Whether to use effective roles (for frontend) or real roles (for backend)
 */
export function can(
  user: Pick<AkariUser, 'effectiveRoles' | 'realRoles' | 'featureGrants'> | null,
  featureKey: FeatureKey,
  now: Date = new Date(),
  useEffectiveRoles: boolean = true
): boolean {
  // Not logged in = no permissions
  if (!user) {
    return false;
  }

  const rolesToCheck = useEffectiveRoles ? user.effectiveRoles : user.realRoles;

  // Check if any role implies this feature
  for (const role of rolesToCheck) {
    if (roleImpliesFeature(role, featureKey)) {
      return true;
    }
  }

  // Check feature grants
  for (const grant of user.featureGrants) {
    if (grant.featureKey !== featureKey) {
      continue;
    }

    // Check if grant is currently active
    const startsOk = grant.startsAt === null || grant.startsAt <= now;
    const endsOk = grant.endsAt === null || grant.endsAt >= now;

    if (startsOk && endsOk) {
      return true;
    }
  }

  return false;
}

/**
 * Server-side permission check - always uses real roles.
 */
export function canServer(
  user: Pick<AkariUser, 'realRoles' | 'featureGrants'> | null,
  featureKey: FeatureKey,
  now: Date = new Date()
): boolean {
  if (!user) {
    return false;
  }

  // Check if any real role implies this feature
  for (const role of user.realRoles) {
    if (roleImpliesFeature(role, featureKey)) {
      return true;
    }
  }

  // Check feature grants
  for (const grant of user.featureGrants) {
    if (grant.featureKey !== featureKey) {
      continue;
    }

    const startsOk = grant.startsAt === null || grant.startsAt <= now;
    const endsOk = grant.endsAt === null || grant.endsAt >= now;

    if (startsOk && endsOk) {
      return true;
    }
  }

  return false;
}

/**
 * Get all features available to a user.
 */
export function getUserFeatures(
  user: Pick<AkariUser, 'effectiveRoles' | 'featureGrants'> | null,
  now: Date = new Date()
): Set<FeatureKey> {
  const features = new Set<FeatureKey>();

  if (!user) {
    return features;
  }

  // Add role-implied features
  for (const role of user.effectiveRoles) {
    if (role === 'super_admin') {
      // Super admin gets all known features
      Object.values(ROLE_FEATURES).flat().forEach(f => features.add(f));
      features.add('*'); // Special marker for "all features"
    } else {
      ROLE_FEATURES[role]?.forEach(f => features.add(f));
    }
  }

  // Add granted features
  for (const grant of user.featureGrants) {
    const startsOk = grant.startsAt === null || grant.startsAt <= now;
    const endsOk = grant.endsAt === null || grant.endsAt >= now;

    if (startsOk && endsOk) {
      features.add(grant.featureKey);
    }
  }

  return features;
}

/**
 * Check if user has Super Admin role.
 */
export function isSuperAdmin(user: Pick<AkariUser, 'realRoles'> | null): boolean {
  return user?.realRoles?.includes('super_admin') ?? false;
}

/**
 * Get the highest role from an array of roles.
 */
export function getHighestRole(roles: Role[]): Role {
  const hierarchy: Role[] = ['super_admin', 'admin', 'analyst', 'user'];
  for (const role of hierarchy) {
    if (roles.includes(role)) {
      return role;
    }
  }
  return 'user';
}

