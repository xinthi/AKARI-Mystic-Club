import { prisma } from './prisma.js';

/**
 * Update user tier based on their current points
 * @param userId - User ID
 * @param points - Current user points
 * @returns Updated tier string or null
 */
export async function updateTier(userId: string, points: number): Promise<string | null> {
  // Get all tiers sorted by minPoints descending
  const tiers = await prisma.tier.findMany({
    orderBy: { minPoints: 'desc' }
  });

  // Find matching tier
  for (const tier of tiers) {
    if (points >= tier.minPoints) {
      if (tier.maxPoints === null || points <= tier.maxPoints) {
        const tierString = `${tier.name}_L${tier.level}`;
        
        // Update user tier
        await prisma.user.update({
          where: { id: userId },
          data: { tier: tierString }
        });
        
        return tierString;
      }
    }
  }

  return null;
}

/**
 * Get tier configuration by tier string (e.g., "Seeker_L1")
 */
export async function getTierConfig(tierString: string | null) {
  if (!tierString) return null;
  
  const [name, levelStr] = tierString.split('_L');
  const level = parseInt(levelStr, 10);
  
  return await prisma.tier.findUnique({
    where: {
      name_level: {
        name,
        level
      }
    }
  });
}

