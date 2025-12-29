/**
 * ARC UI Helpers
 * 
 * Utility functions for ARC UI components including level calculation,
 * badge computation, and quest categorization.
 */

/**
 * Calculate level from score/points
 * Level thresholds:
 * - Level 1: 0-99
 * - Level 2: 100-249
 * - Level 3: 250-499
 * - Level 4: 500-999
 * - Level 5: 1000+
 */
export function calculateLevelFromScore(points: number): { level: number; xpInLevel: number; xpForNextLevel: number } {
  if (points < 100) {
    return { level: 1, xpInLevel: points, xpForNextLevel: 100 };
  } else if (points < 250) {
    return { level: 2, xpInLevel: points - 100, xpForNextLevel: 150 };
  } else if (points < 500) {
    return { level: 3, xpInLevel: points - 250, xpForNextLevel: 250 };
  } else if (points < 1000) {
    return { level: 4, xpInLevel: points - 500, xpForNextLevel: 500 };
  } else {
    return { level: 5, xpInLevel: points - 1000, xpForNextLevel: 0 }; // Max level
  }
}

/**
 * Calculate rank badge from rank position
 */
export function getRankBadgeFromRank(rank: number): 'Verified Raider' | 'Signal Contributor' | 'Core Raider' | 'Legend' | null {
  if (rank <= 3) return 'Legend';
  if (rank <= 20) return 'Core Raider';
  if (rank <= 50) return 'Signal Contributor';
  return 'Verified Raider';
}

/**
 * Get badge display info
 */
export function getBadgeDisplayInfo(badge: 'Verified Raider' | 'Signal Contributor' | 'Core Raider' | 'Legend'): {
  name: string;
  color: string;
  description: string;
} {
  switch (badge) {
    case 'Legend':
      return {
        name: 'Legend',
        color: 'from-purple-500 to-pink-500',
        description: 'Top 3 creators',
      };
    case 'Core Raider':
      return {
        name: 'Core Raider',
        color: 'from-yellow-400 to-yellow-600',
        description: 'Top 20 creators',
      };
    case 'Signal Contributor':
      return {
        name: 'Signal Contributor',
        color: 'from-blue-400 to-blue-600',
        description: 'Top 50 creators',
      };
    case 'Verified Raider':
      return {
        name: 'Verified Raider',
        color: 'from-green-400 to-green-600',
        description: 'Joined and completed first quest',
      };
  }
}

/**
 * Categorize quest by mission_id
 */
export function getQuestCategory(missionId: string): 'Quick' | 'Signal' | 'Weekly Boss' | 'Other' {
  switch (missionId) {
    case 'intro-thread':
      return 'Quick';
    case 'meme-drop':
    case 'signal-boost':
      return 'Signal';
    case 'deep-dive':
      return 'Weekly Boss';
    default:
      return 'Other';
  }
}

/**
 * Get quest category display info
 */
export function getQuestCategoryInfo(category: 'Quick' | 'Signal' | 'Weekly Boss' | 'Other'): {
  name: string;
  icon: string;
  color: string;
} {
  switch (category) {
    case 'Quick':
      return { name: 'Quick Quests', icon: '⚡', color: 'bg-green-500/20 border-green-500/50 text-green-400' };
    case 'Signal':
      return { name: 'Signal Quests', icon: '📡', color: 'bg-blue-500/20 border-blue-500/50 text-blue-400' };
    case 'Weekly Boss':
      return { name: 'Weekly Boss Quest', icon: '👑', color: 'bg-purple-500/20 border-purple-500/50 text-purple-400' };
    case 'Other':
      return { name: 'Other', icon: '📌', color: 'bg-gray-500/20 border-gray-500/50 text-gray-400' };
  }
}

