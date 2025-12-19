/**
 * ARC Access Policy
 * 
 * Single source of truth for tier-based access control to ARC routes and APIs.
 * 
 * Tiers:
 * - seer: Free tier, basic ARC viewing
 * - analyst: Full ARC access (leaderboards, gamified, creator manager)
 * - institutional_plus: All ARC features (same as analyst for now)
 * - super_admin: Bypass all checks (handled separately)
 */

import type { UserTier } from '../userTier';

// =============================================================================
// TYPES
// =============================================================================

export type ArcRoute = 
  | '/portal/arc'
  | '/portal/arc/[slug]'
  | '/portal/arc/gamified/[projectId]'
  | '/portal/arc/creator-manager'
  | '/portal/arc/requests'
  | '/portal/arc/admin/*';

export type ArcApiRoute =
  | '/api/portal/arc/top-projects'
  | '/api/portal/arc/projects'
  | '/api/portal/arc/summary'
  | '/api/portal/arc/cta-state'
  | '/api/portal/arc/leaderboard-requests'
  | '/api/portal/arc/project/[projectId]'
  | '/api/portal/arc/leaderboard/[projectId]'
  | '/api/portal/arc/gamified/[projectId]'
  | '/api/portal/admin/arc/*';

// =============================================================================
// POLICY MAP
// =============================================================================

/**
 * Minimum tier required to access each ARC page route.
 * Super admins bypass all checks (handled separately).
 */
export const ARC_PAGE_POLICY: Record<string, UserTier> = {
  '/portal/arc': 'seer', // Basic ARC overview (treemap view)
  '/portal/arc/[slug]': 'analyst', // Project detail page
  '/portal/arc/gamified/[projectId]': 'analyst', // Gamified leaderboard
  '/portal/arc/creator-manager': 'analyst', // Creator manager tools
  '/portal/arc/requests': 'seer', // Anyone can request ARC access
  '/portal/arc/admin/*': 'institutional_plus', // Admin pages (also requires super_admin, but tier check first)
};

/**
 * Minimum tier required to access each ARC API endpoint.
 * Super admins bypass all checks (handled separately).
 */
export const ARC_API_POLICY: Record<string, UserTier> = {
  '/api/portal/arc/top-projects': 'seer', // Public treemap data
  '/api/portal/arc/projects': 'seer', // List ARC projects
  '/api/portal/arc/summary': 'seer', // ARC summary stats
  '/api/portal/arc/cta-state': 'seer', // CTA state (anyone can check)
  '/api/portal/arc/leaderboard-requests': 'seer', // Request leaderboard (anyone can request)
  '/api/portal/arc/project/[projectId]': 'analyst', // Project details
  '/api/portal/arc/leaderboard/[projectId]': 'analyst', // Leaderboard data
  '/api/portal/arc/gamified/[projectId]': 'analyst', // Gamified data
  '/api/portal/admin/arc/*': 'institutional_plus', // Admin APIs (also requires super_admin)
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a user tier meets the minimum required tier.
 * Tiers are hierarchical: seer < analyst < institutional_plus
 */
export function tierMeetsRequirement(
  userTier: UserTier,
  requiredTier: UserTier
): boolean {
  const tierHierarchy: UserTier[] = ['seer', 'analyst', 'institutional_plus'];
  const userIndex = tierHierarchy.indexOf(userTier);
  const requiredIndex = tierHierarchy.indexOf(requiredTier);
  
  return userIndex >= requiredIndex;
}

/**
 * Get required tier for a page route.
 * Returns null if route is not in policy (default deny).
 */
export function getRequiredTierForPage(route: string): UserTier | null {
  // Exact match
  if (ARC_PAGE_POLICY[route]) {
    return ARC_PAGE_POLICY[route];
  }
  
  // Pattern matching for dynamic routes
  if (route.startsWith('/portal/arc/admin/')) {
    return ARC_PAGE_POLICY['/portal/arc/admin/*'];
  }
  
  // Pattern matching for [slug] routes
  if (route.match(/^\/portal\/arc\/[^/]+$/)) {
    return ARC_PAGE_POLICY['/portal/arc/[slug]'];
  }
  
  // Pattern matching for gamified/[projectId]
  if (route.match(/^\/portal\/arc\/gamified\/[^/]+$/)) {
    return ARC_PAGE_POLICY['/portal/arc/gamified/[projectId]'];
  }
  
  return null;
}

/**
 * Get required tier for an API route.
 * Returns null if route is not in policy (default deny).
 */
export function getRequiredTierForApi(route: string): UserTier | null {
  // Exact match
  if (ARC_API_POLICY[route]) {
    return ARC_API_POLICY[route];
  }
  
  // Pattern matching for admin routes
  if (route.startsWith('/api/portal/admin/arc/')) {
    return ARC_API_POLICY['/api/portal/admin/arc/*'];
  }
  
  // Pattern matching for project/[projectId]
  if (route.match(/^\/api\/portal\/arc\/project\/[^/]+$/)) {
    return ARC_API_POLICY['/api/portal/arc/project/[projectId]'];
  }
  
  // Pattern matching for leaderboard/[projectId]
  if (route.match(/^\/api\/portal\/arc\/leaderboard\/[^/]+$/)) {
    return ARC_API_POLICY['/api/portal/arc/leaderboard/[projectId]'];
  }
  
  // Pattern matching for gamified/[projectId]
  if (route.match(/^\/api\/portal\/arc\/gamified\/[^/]+$/)) {
    return ARC_API_POLICY['/api/portal/arc/gamified/[projectId]'];
  }
  
  return null;
}

/**
 * Get human-readable tier name for error messages.
 */
export function getTierDisplayName(tier: UserTier): string {
  switch (tier) {
    case 'seer':
      return 'Seer';
    case 'analyst':
      return 'Analyst';
    case 'institutional_plus':
      return 'Institutional Plus';
  }
}

