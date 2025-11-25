/**
 * Tier Management Utilities
 *
 * Updates user tiers based on points
 * Note: Tiers are now computed from points, not from a database table
 */

import { prisma } from './prisma';

interface TierConfig {
  name: string;
  level: number;
  minPoints: number;
  maxPoints: number | null;
  badgeEmoji: string;
  color: string;
}

// Static tier configuration
const TIER_CONFIGS: TierConfig[] = [
  { name: 'Seeker', level: 1, minPoints: 0, maxPoints: 99, badgeEmoji: '🔮', color: '#9333ea' },
  { name: 'Seeker', level: 2, minPoints: 100, maxPoints: 499, badgeEmoji: '🔮', color: '#9333ea' },
  { name: 'Alchemist', level: 1, minPoints: 500, maxPoints: 999, badgeEmoji: '⚗️', color: '#3b82f6' },
  { name: 'Alchemist', level: 2, minPoints: 1000, maxPoints: 2499, badgeEmoji: '⚗️', color: '#3b82f6' },
  { name: 'Mystic', level: 1, minPoints: 2500, maxPoints: 4999, badgeEmoji: '✨', color: '#f59e0b' },
  { name: 'Mystic', level: 2, minPoints: 5000, maxPoints: 9999, badgeEmoji: '✨', color: '#f59e0b' },
  { name: 'Oracle', level: 1, minPoints: 10000, maxPoints: null, badgeEmoji: '👁️', color: '#ef4444' },
];

/**
 * Determine tier from points
 */
function getTierFromPoints(points: number): TierConfig | null {
  // Sort by minPoints descending and find the first matching tier
  const sortedTiers = [...TIER_CONFIGS].sort((a, b) => b.minPoints - a.minPoints);

  for (const tier of sortedTiers) {
    if (points >= tier.minPoints) {
      if (tier.maxPoints === null || points <= tier.maxPoints) {
        return tier;
      }
    }
  }

  return TIER_CONFIGS[0]; // Default to lowest tier
}

/**
 * Update user tier based on their current points
 */
export async function updateTier(userId: string, points: number): Promise<string | null> {
  const tierConfig = getTierFromPoints(points);

  if (!tierConfig) return null;

  const tierString = `${tierConfig.name}_L${tierConfig.level}`;

  // Update user tier
  await prisma.user.update({
    where: { id: userId },
    data: { tier: tierString },
  });

  return tierString;
}

/**
 * Get tier configuration by tier string (e.g., "Seeker_L1")
 */
export function getTierConfig(tierString: string | null): TierConfig | null {
  if (!tierString) return null;

  const [name, levelStr] = tierString.split('_L');
  const level = parseInt(levelStr, 10);

  return TIER_CONFIGS.find((t) => t.name === name && t.level === level) || null;
}

/**
 * Get all tier configurations
 */
export function getAllTiers(): TierConfig[] {
  return TIER_CONFIGS;
}
