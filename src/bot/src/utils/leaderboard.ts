import { prisma } from './prisma.js';

/**
 * Compute campaign leaderboard
 * @param campaignId - Campaign ID
 * @returns Leaderboard data
 */
export async function computeCampaignLeaderboard(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      createdBy: true
    }
  });

  if (!campaign) return null;

  // Parse completions JSON
  const completions = (campaign.completions as any[]) || [];
  
  // Count completions per user
  const userCompletions: Record<string, number> = {};
  for (const completion of completions) {
    const userId = completion.userId;
    userCompletions[userId] = (userCompletions[userId] || 0) + 1;
  }

  // Calculate points (0.2 per completion)
  const leaderboard = Object.entries(userCompletions)
    .map(([userId, count]) => ({
      userId,
      completions: count,
      points: count * 0.2
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 10); // Top 10

  // Fetch user details
  const userIds = leaderboard.map(l => l.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      username: true,
      telegramId: true,
      points: true,
      credibilityScore: true
    }
  });

  const userMap = new Map(users.map(u => [u.id, u]));

  // Combine data
  const result = leaderboard.map((entry, index) => {
    const user = userMap.get(entry.userId);
    return {
      rank: index + 1,
      username: user?.username || `User ${user?.telegramId}`,
      completions: entry.completions,
      points: entry.points,
      cred: user?.credibilityScore || 0
    };
  });

  // Update campaign leaderboard
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      leaderboard: result as any
    }
  });

  return result;
}

/**
 * Get overall leaderboard by tier
 * @param tierPattern - Tier pattern like "Sentinel_%" or null for all
 * @returns Leaderboard data
 */
export async function getOverallLeaderboard(tierPattern: string | null = null) {
  const where: any = {};
  
  if (tierPattern) {
    where.tier = {
      startsWith: tierPattern.replace('%', '')
    };
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { points: 'desc' },
    take: 100,
    select: {
      id: true,
      username: true,
      telegramId: true,
      points: true,
      tier: true,
      credibilityScore: true
    }
  });

  return users.map((user, index) => ({
    rank: index + 1,
    username: user.username || `User ${user.telegramId}`,
    points: user.points,
    tier: user.tier || 'None',
    cred: user.credibilityScore || 0
  }));
}

