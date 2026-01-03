/**
 * ARC Route Utilities
 * 
 * Helper functions for constructing routes based on leaderboard item data
 */

import { LiveLeaderboard } from '@/lib/arc/useArcHomeData';

/**
 * Get route href for a leaderboard item based on its kind
 * 
 * CORRECTED FLOW: Leaderboard items route to public project page, not arena management page
 */
export function getLeaderboardRoute(item: LiveLeaderboard): string {
  // For both 'arena' and 'gamified' kinds, route to public project page
  // The project page shows the leaderboard directly
  // Gamified features (sprints/quests) appear in sidebar on the project page
  if (item.kind === 'arena' || item.kind === 'gamified') {
    if (item.projectSlug) {
      return `/portal/arc/${item.projectSlug}`;
    }
    return `/portal/arc/project/${item.projectId}`;
  } else if (item.kind === 'campaign') {
    // Campaigns route to their project page
    if (item.projectSlug) {
      return `/portal/arc/${item.projectSlug}`;
    }
    return `/portal/arc/project/${item.projectId}`;
  }
  
  // Fallback to project route
  if (item.projectSlug) {
    return `/portal/arc/${item.projectSlug}`;
  }
  // Legacy fallback (redirects to slug-based route)
  return `/portal/arc/project/${item.projectId}`;
}

/**
 * Get user initials from display name
 */
export function getUserInitials(displayName: string | null | undefined): string {
  if (!displayName) return 'U';
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return displayName.slice(0, 2).toUpperCase();
}

