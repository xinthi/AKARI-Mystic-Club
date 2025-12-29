/**
 * ARC User-Facing Naming
 * 
 * Centralized naming for ARC features to ensure consistency across the UI.
 * Replaces technical "Option 1/2/3" labels with user-friendly names.
 */

export const ARC_FEATURE_NAMES = {
  // Option 1 / CRM
  CREATOR_HUB: 'Creator Hub',
  
  // Option 2 / Classic Leaderboard
  MINDSHARE_LEADERBOARD: 'Mindshare Leaderboard',
  
  // Option 3 / Gamified
  QUEST_LEADERBOARD: 'Quest Leaderboard',
} as const;

/**
 * Map technical access level to user-facing name
 */
export function getArcFeatureName(accessLevel: 'creator_manager' | 'leaderboard' | 'gamified' | 'none' | string): string {
  switch (accessLevel) {
    case 'creator_manager':
      return ARC_FEATURE_NAMES.CREATOR_HUB;
    case 'leaderboard':
      return ARC_FEATURE_NAMES.MINDSHARE_LEADERBOARD;
    case 'gamified':
      return ARC_FEATURE_NAMES.QUEST_LEADERBOARD;
    case 'none':
      return 'None';
    default:
      return accessLevel; // Fallback to original if unknown
  }
}

/**
 * Get feature description for UI tooltips/help text
 */
export function getArcFeatureDescription(accessLevel: 'creator_manager' | 'leaderboard' | 'gamified' | string): string {
  switch (accessLevel) {
    case 'creator_manager':
      return 'Manage creator campaigns and track engagement';
    case 'leaderboard':
      return 'Public leaderboard ranking creators by contribution';
    case 'gamified':
      return 'Quest-based leaderboard with missions and rewards';
    default:
      return '';
  }
}

