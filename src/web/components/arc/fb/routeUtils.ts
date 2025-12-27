/**
 * Route utilities for ARC items
 */

import { LiveItem } from '@/lib/arc/useArcLiveItems';

/**
 * Get route href for a live item based on its kind
 */
export function getLiveItemRoute(item: LiveItem): string {
  if (item.kind === 'arena' && item.project.slug && item.arenaSlug) {
    return `/portal/arc/${item.project.slug}/arena/${item.arenaSlug}`;
  } else if (item.kind === 'campaign') {
    // Campaigns route to their project page
    if (item.project.slug) {
      return `/portal/arc/${item.project.slug}`;
    }
    return `/portal/arc/project/${item.project.id}`;
  } else if (item.kind === 'gamified') {
    return `/portal/arc/gamified/${item.project.id}`;
  }
  
  // Fallback to project route
  if (item.project.slug) {
    return `/portal/arc/${item.project.slug}`;
  }
  return `/portal/arc/project/${item.project.id}`;
}

