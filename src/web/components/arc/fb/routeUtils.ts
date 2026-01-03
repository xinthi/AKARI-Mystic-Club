/**
 * Route utilities for ARC items
 */

import { LiveItem } from '@/lib/arc/useArcLiveItems';

/**
 * Get route href for a live item based on project access level and kind
 * 
 * Routing rules (CORRECTED FLOW):
 * - leaderboard access level (MS LB) → /portal/arc/[projectSlug] (public project page with leaderboard)
 * - gamified access level (GameFi LB) → /portal/arc/[projectSlug] (public project page with leaderboard + quests)
 * - creator_manager access level (CRM) → /portal/arc/creator-manager?projectId=[projectSlug|id] (visibility checked on page)
 * - Fallback to kind-based routing if access level not available
 * 
 * NOTE: Arena management is at /portal/arc/admin/[projectSlug], not the public arena page
 */
export function getLiveItemRoute(item: LiveItem): string | null {
  const accessLevel = item.project.accessLevel;
  const projectIdentifier = item.project.slug || item.project.id;

  // Route based on access level (preferred method)
  if (accessLevel === 'leaderboard' || accessLevel === 'gamified') {
    // MS Leaderboard OR GameFi Leaderboard: Route to public project page
    // The project page shows the leaderboard directly (not arena management)
    // GameFi features (quests) appear in sidebar on the project page
    if (item.project.slug) {
      return `/portal/arc/${item.project.slug}`;
    }
    // Legacy fallback (redirects to project page by ID)
    return `/portal/arc/project/${item.project.id}`;
  }

  if (accessLevel === 'creator_manager') {
    // CRM (Option 1): Route to creator manager (page handles visibility checks)
    return `/portal/arc/creator-manager?projectId=${projectIdentifier}`;
  }

  // Fallback: route based on kind (backward compatibility)
  // For both 'arena' and 'gamified' kinds, route to project page (not arena page)
  if (item.kind === 'arena' || item.kind === 'gamified') {
    if (item.project.slug) {
      return `/portal/arc/${item.project.slug}`;
    }
    return `/portal/arc/project/${item.project.id}`;
  } else if (item.kind === 'campaign') {
    // Campaign (CRM): Route to creator manager
    return `/portal/arc/creator-manager?projectId=${projectIdentifier}`;
  }
  
  // If no access level and no kind match, return null (item not clickable)
  return null;
}

