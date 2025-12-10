/**
 * User Tier Detection Helper
 * 
 * Maps user roles and feature grants to human-readable tier names.
 * This is a UI-only mapping that doesn't change backend permission logic.
 */

import type { AkariUser } from './permissions';
import { can, FEATURE_KEYS } from './permissions';

// =============================================================================
// TYPES
// =============================================================================

export type UserTier = 'seer' | 'analyst' | 'institutional_plus';

export interface TierInfo {
  key: UserTier;
  name: string;
  description: string;
  color: string;
  bgColor: string;
}

// =============================================================================
// TIER DEFINITIONS
// =============================================================================

export const TIER_INFO: Record<UserTier, TierInfo> = {
  seer: {
    key: 'seer',
    name: 'Seer',
    description: 'Free tier with basic access',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20 border-blue-500/30',
  },
  analyst: {
    key: 'analyst',
    name: 'Analyst',
    description: 'Full analytics and comparison tools',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20 border-purple-500/30',
  },
  institutional_plus: {
    key: 'institutional_plus',
    name: 'Institutional Plus',
    description: 'Enterprise-grade analytics and insights',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20 border-amber-500/30',
  },
};

// =============================================================================
// TIER DETECTION
// =============================================================================

/**
 * Determine the user's tier based on roles and feature grants.
 * 
 * Logic:
 * - If user has Institutional Plus or Deep Explorer features → "institutional_plus"
 * - Else if user has analyst-level features (compare, analytics) → "analyst"
 * - Else → "seer" (default/free tier)
 * 
 * @param user - The user object with roles and feature grants
 * @returns The user's tier
 */
export function getUserTier(user: AkariUser | null): UserTier {
  if (!user || !user.isLoggedIn) {
    return 'seer';
  }

  const now = new Date();

  // Check for Institutional Plus features
  // If user has deep.explorer or institutional.plus grants, they're Institutional Plus
  const hasDeepExplorer = can(user, FEATURE_KEYS.DeepExplorer, now);
  const hasInstitutionalPlus = can(user, FEATURE_KEYS.InstitutionalPlus, now);

  if (hasDeepExplorer || hasInstitutionalPlus) {
    return 'institutional_plus';
  }

  // Check for Analyst-level features
  // Analyst tier includes: sentiment.compare, markets.analytics, sentiment.search
  const hasCompare = can(user, 'sentiment.compare', now);
  const hasAnalytics = can(user, 'markets.analytics', now);
  const hasSearch = can(user, 'sentiment.search', now);

  // Also check if user has 'analyst' role (which implies these features)
  const hasAnalystRole = user.effectiveRoles.includes('analyst') || user.effectiveRoles.includes('admin');

  if (hasCompare || hasAnalytics || hasSearch || hasAnalystRole) {
    return 'analyst';
  }

  // Default to Seer (free tier)
  return 'seer';
}

/**
 * Get tier information for display.
 */
export function getTierInfo(tier: UserTier): TierInfo {
  return TIER_INFO[tier];
}

/**
 * Get tier info for a user.
 */
export function getUserTierInfo(user: AkariUser | null): TierInfo {
  const tier = getUserTier(user);
  return getTierInfo(tier);
}

/**
 * Check if user can upgrade to a specific tier.
 * Returns true if user's current tier is lower than the target tier.
 */
export function canUpgradeTo(user: AkariUser | null, targetTier: UserTier): boolean {
  const currentTier = getUserTier(user);
  
  const tierHierarchy: UserTier[] = ['seer', 'analyst', 'institutional_plus'];
  const currentIndex = tierHierarchy.indexOf(currentTier);
  const targetIndex = tierHierarchy.indexOf(targetTier);
  
  return targetIndex > currentIndex;
}

