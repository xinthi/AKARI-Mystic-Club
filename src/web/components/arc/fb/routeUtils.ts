/**
 * Route utilities for ARC items
 */

import { LiveItem } from '@/lib/arc/useArcLiveItems';

/**
 * Get route href for a live item based on project access level and kind
 * 
 * Routing rules:
 * - leaderboard access level (Option 2) → /portal/arc/[projectSlug]/arena/[arenaSlug] if arena exists
 * - gamified access level (Option 3) → /portal/arc/[projectSlug]/arena/[arenaSlug] (same as Option 2, quests run alongside)
 * - creator_manager access level (Option 1) → /portal/arc/creator-manager?projectId=[projectSlug|id] (visibility checked on page)
 * - Fallback to kind-based routing if access level not available
 */
export function getLiveItemRoute(item: LiveItem): string | null {
  const accessLevel = item.project.accessLevel;
  const projectIdentifier = item.project.slug || item.project.id;

  // Route based on access level (preferred method)
  if (accessLevel === 'leaderboard' || accessLevel === 'gamified') {
    // Normal Leaderboard (Option 2) OR Gamified (Option 3): Both use normal arena leaderboard
    // Gamified features (sprints/quests) run ALONGSIDE the normal leaderboard
    // Route to arena leaderboard if available, otherwise leaderboard page
    if (item.kind === 'arena' && item.project.slug && item.arenaSlug) {
      return `/portal/arc/${item.project.slug}/arena/${item.arenaSlug}`;
    }
    // Route to dedicated leaderboard page
    return `/portal/arc/leaderboard/${item.project.id}`;
  }

  if (accessLevel === 'creator_manager') {
    // CRM (Option 1): Route to creator manager (page handles visibility checks)
    return `/portal/arc/creator-manager?projectId=${projectIdentifier}`;
  }

  // Fallback: route based on kind (backward compatibility)
  // For both 'arena' and 'gamified' kinds, route to arena page
  // Gamified features (sprints/quests) run ALONGSIDE the normal leaderboard
  if ((item.kind === 'arena' || item.kind === 'gamified') && item.project.slug && item.arenaSlug) {
    return `/portal/arc/${item.project.slug}/arena/${item.arenaSlug}`;
  } else if (item.kind === 'campaign') {
    // Campaign (CRM): Route to creator manager
    return `/portal/arc/creator-manager?projectId=${projectIdentifier}`;
  }
  
  // If no access level and no kind match, return null (item not clickable)
  return null;
}

