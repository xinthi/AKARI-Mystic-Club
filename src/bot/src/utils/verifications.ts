import { Bot, Context } from 'grammy';
import { prisma } from './prisma.js';
import { getTwitterClient } from './twitter.js';
import { awardPoints } from './stars.js';

/**
 * Verify Telegram group/channel membership
 */
export async function verifyTelegramJoin(
  bot: Bot,
  userId: string,
  chatId: string
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) return false;

    const member = await bot.api.getChatMember(chatId, Number(user.telegramId));
    return member.status === 'member' || member.status === 'administrator' || member.status === 'creator';
  } catch (error) {
    console.error('Error verifying Telegram join:', error);
    return false;
  }
}

/**
 * Verify X (Twitter) follow
 */
export async function verifyXFollow(
  userId: string,
  targetUsername: string
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.xUserId) return false;

    const client = getTwitterClient();
    const targetUser = await client.v2.userByUsername(targetUsername);
    
    if (!targetUser.data) return false;

    const followers = await client.v2.followers(user.xUserId, {
      max_results: 1000
    });

    return followers.data?.some(f => f.id === targetUser.data.id) || false;
  } catch (error) {
    console.error('Error verifying X follow:', error);
    return false;
  }
}

/**
 * Verify X (Twitter) like
 */
export async function verifyXLike(
  userId: string,
  tweetId: string
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.xUserId) return false;

    const client = getTwitterClient();
    const likedTweets = await client.v2.userLikedTweets(user.xUserId, {
      max_results: 100
    });

    return likedTweets.data?.some(t => t.id === tweetId) || false;
  } catch (error) {
    console.error('Error verifying X like:', error);
    return false;
  }
}

/**
 * Verify X (Twitter) repost
 */
export async function verifyXRepost(
  userId: string,
  tweetId: string
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.xUserId) return false;

    const client = getTwitterClient();
    const retweeters = await client.v2.tweetRetweetedBy(tweetId, {
      max_results: 100
    });

    return retweeters.data?.some(u => u.id === user.xUserId) || false;
  } catch (error) {
    console.error('Error verifying X repost:', error);
    return false;
  }
}

/**
 * Complete verification task and award points
 */
export async function completeVerification(
  userId: string,
  taskId: string,
  taskType: string
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) return false;

    // Check if already completed
    const completedTasks = (user.completedTasks as any[]) || [];
    if (completedTasks.some(t => t.id === taskId && t.type === taskType)) {
      return false; // Already completed
    }

    // Add to completed tasks
    await prisma.user.update({
      where: { id: userId },
      data: {
        completedTasks: {
          push: {
            id: taskId,
            type: taskType,
            completedAt: new Date().toISOString()
          }
        }
      }
    });

    // Award points
    await awardPoints(userId, 0.2);

    return true;
  } catch (error) {
    console.error('Error completing verification:', error);
    return false;
  }
}

