/**
 * Creator Gamification Helpers
 * 
 * Utilities for Creator Manager gamification features:
 * - Level calculation from XP
 * - Class management
 * - Badge management
 */

// =============================================================================
// TYPES
// =============================================================================

export type CreatorClass = 'Vanguard' | 'Analyst' | 'Amplifier' | 'Explorer';

export interface CreatorLevelInfo {
  level: number;
  xp: number;
  xpForNextLevel: number | null; // null if max level
  xpProgress: number; // 0-100 percentage to next level
}

// =============================================================================
// LEVEL CALCULATION
// =============================================================================

/**
 * XP to Level mapping:
 * - Level 1: 0 to 99 XP
 * - Level 2: 100 to 249 XP
 * - Level 3: 250 to 499 XP
 * - Level 4: 500 to 999 XP
 * - Level 5: 1000+ XP
 */
const LEVEL_THRESHOLDS = [
  { level: 1, minXp: 0, maxXp: 99 },
  { level: 2, minXp: 100, maxXp: 249 },
  { level: 3, minXp: 250, maxXp: 499 },
  { level: 4, minXp: 500, maxXp: 999 },
  { level: 5, minXp: 1000, maxXp: Infinity },
];

/**
 * Calculate creator level from XP
 */
export function calculateLevel(xp: number): number {
  for (const threshold of LEVEL_THRESHOLDS) {
    if (xp >= threshold.minXp && xp <= threshold.maxXp) {
      return threshold.level;
    }
  }
  // Fallback to max level
  return 5;
}

/**
 * Get detailed level information including progress to next level
 */
export function getLevelInfo(xp: number): CreatorLevelInfo {
  const level = calculateLevel(xp);
  const threshold = LEVEL_THRESHOLDS[level - 1];
  
  let xpForNextLevel: number | null = null;
  let xpProgress = 100;

  if (level < 5) {
    const nextThreshold = LEVEL_THRESHOLDS[level];
    xpForNextLevel = nextThreshold.minXp;
    const xpInCurrentLevel = xp - threshold.minXp;
    const xpNeededForNext = nextThreshold.minXp - threshold.minXp;
    xpProgress = Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForNext) * 100));
  }

  return {
    level,
    xp,
    xpForNextLevel,
    xpProgress: Math.round(xpProgress),
  };
}

/**
 * Get XP required for a specific level
 */
export function getXpForLevel(targetLevel: number): number {
  if (targetLevel < 1 || targetLevel > 5) {
    return 0;
  }
  return LEVEL_THRESHOLDS[targetLevel - 1].minXp;
}

// =============================================================================
// CLASS VALIDATION
// =============================================================================

/**
 * Valid creator classes
 */
export const CREATOR_CLASSES: CreatorClass[] = ['Vanguard', 'Analyst', 'Amplifier', 'Explorer'];

/**
 * Check if a class is valid
 */
export function isValidClass(className: string | null | undefined): className is CreatorClass {
  return className !== null && className !== undefined && CREATOR_CLASSES.includes(className as CreatorClass);
}

/**
 * TODO: Auto-assign class based on creator performance metrics
 * This will analyze:
 * - ARC points earned
 * - Mission completion rate
 * - Engagement metrics
 * - Content quality scores
 * 
 * For now, classes are manually assigned by admins/moderators.
 */
export function getSuggestedClass(
  arcPoints: number,
  xp: number,
  missionCompletionRate: number
): CreatorClass | null {
  // TODO: Implement auto-classification logic
  // This is a placeholder for future implementation
  return null;
}

