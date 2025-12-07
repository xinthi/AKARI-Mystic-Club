/**
 * Unified Twitter Client
 * 
 * This module provides a unified interface for Twitter data,
 * using ONLY TwitterAPI.io as the data source.
 * 
 * Features:
 * - All data comes from TwitterAPI.io
 * - No RapidAPI fallback (completely removed)
 * - Consistent data normalization
 * - Profile images always included (profileImageUrl)
 * 
 * Usage:
 *   import { unifiedGetUserInfo, unifiedSearchUsers } from '@/server/twitterClient';
 */

import * as taio from './twitterapiio';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Log configuration on module load
console.log(`[TwitterClient] Provider: twitterapiio (exclusive)`);
console.log(`[TwitterClient] TWITTERAPIIO_API_KEY: ${process.env.TWITTERAPIIO_API_KEY ? 'SET' : 'NOT SET'}`);

// =============================================================================
// UNIFIED TYPES
// =============================================================================

/**
 * Unified user profile type used across the application
 */
export interface UnifiedUserProfile {
  id: string;
  username: string;
  name: string;
  profileImageUrl: string;
  bio: string;
  followers: number;
  following: number;
  tweetCount: number;
  isVerified: boolean;
  verifiedType: string | null;
  createdAt: string;
}

/**
 * Unified tweet type used across the application
 */
export interface UnifiedTweet {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorName: string;
  authorProfileImageUrl: string;
  createdAt: string;
  likeCount: number;
  replyCount: number;
  retweetCount: number;
  quoteCount: number;
  viewCount: number;
  isRetweet: boolean;
  isReply: boolean;
}

// =============================================================================
// NORMALIZATION HELPERS
// =============================================================================

/**
 * Convert TwitterAPI.io user to unified format
 */
function normalizeFromTaio(user: taio.IUserInfo): UnifiedUserProfile {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    profileImageUrl: user.profileImageUrl,
    bio: user.description,
    followers: user.followers,
    following: user.following,
    tweetCount: user.tweetCount,
    isVerified: user.isBlueVerified,
    verifiedType: user.verifiedType,
    createdAt: user.createdAt,
  };
}


/**
 * Convert TwitterAPI.io tweet to unified format
 */
function normalizeTweetFromTaio(tweet: taio.ITweet): UnifiedTweet {
  return {
    id: tweet.id,
    text: tweet.text,
    authorId: tweet.authorId,
    authorUsername: tweet.authorUsername,
    authorName: tweet.authorName,
    authorProfileImageUrl: tweet.authorProfileImageUrl,
    createdAt: tweet.createdAt,
    likeCount: tweet.likeCount,
    replyCount: tweet.replyCount,
    retweetCount: tweet.retweetCount,
    quoteCount: tweet.quoteCount,
    viewCount: tweet.viewCount,
    isRetweet: tweet.isRetweet,
    isReply: tweet.isReply,
  };
}

// =============================================================================
// SAFE WRAPPER HELPER
// =============================================================================

/**
 * Execute with safe error handling: returns default value on failure
 * Logs errors for debugging
 */
async function safeExecute<T>(
  fn: () => Promise<T>,
  operation: string,
  defaultValue: T
): Promise<T> {
  try {
    const result = await fn();
    console.log(`[TwitterClient] ${operation} - SUCCESS`);
    return result;
  } catch (error: any) {
    console.warn(`[TwitterClient] ${operation} - FAILED: ${error.message}`);
    return defaultValue;
  }
}

// =============================================================================
// UNIFIED API FUNCTIONS
// =============================================================================

/**
 * Search for Twitter users by query
 * Uses TwitterAPI.io exclusively
 */
export async function unifiedSearchUsers(query: string, limit: number = 10): Promise<UnifiedUserProfile[]> {
  return safeExecute(
    async () => {
      const users = await taio.taioSearchUser(query);
      return users.slice(0, limit).map(normalizeFromTaio);
    },
    `searchUsers(${query})`,
    []
  );
}

/**
 * Get user info by username
 * Uses TwitterAPI.io exclusively
 */
export async function unifiedGetUserInfo(username: string): Promise<UnifiedUserProfile | null> {
  return safeExecute(
    async () => {
      const user = await taio.taioGetUserInfo(username);
      return user ? normalizeFromTaio(user) : null;
    },
    `getUserInfo(${username})`,
    null
  );
}

/**
 * Get user's last tweets
 * Uses TwitterAPI.io exclusively
 */
export async function unifiedGetUserLastTweets(
  username: string,
  limit: number = 50
): Promise<UnifiedTweet[]> {
  return safeExecute(
    async () => {
      const result = await taio.taioGetUserLastTweets(username);
      return result.tweets.slice(0, limit).map(normalizeTweetFromTaio);
    },
    `getUserLastTweets(${username})`,
    []
  );
}

/**
 * Get user's followers
 * Uses TwitterAPI.io exclusively
 */
export async function unifiedGetUserFollowers(
  username: string,
  limit: number = 100
): Promise<UnifiedUserProfile[]> {
  return safeExecute(
    async () => {
      // Request more than limit to account for filtering/deduplication
      const pageSize = Math.min(500, Math.max(200, limit));
      const result = await taio.taioGetUserFollowers(username, pageSize);
      
      if (result.users.length === 0) {
        console.warn(`[TwitterClient] taioGetUserFollowers returned 0 followers for @${username}`);
      }
      
      return result.users.slice(0, limit).map(normalizeFromTaio);
    },
    `getUserFollowers(${username})`,
    []
  );
}

/**
 * Get user's verified followers
 * Uses TwitterAPI.io exclusively
 */
export async function unifiedGetUserVerifiedFollowers(
  username: string,
  limit: number = 50
): Promise<UnifiedUserProfile[]> {
  return safeExecute(
    async () => {
      const pageSize = Math.min(200, Math.max(100, limit));
      const result = await taio.taioGetUserVerifiedFollowers(username, pageSize);
      return result.users.slice(0, limit).map(normalizeFromTaio);
    },
    `getUserVerifiedFollowers(${username})`,
    []
  );
}

/**
 * Advanced search for tweets
 * Uses TwitterAPI.io exclusively
 */
export async function unifiedAdvancedSearchTweets(
  query: string,
  queryType: 'Latest' | 'Top' = 'Latest',
  limit: number = 50
): Promise<UnifiedTweet[]> {
  return safeExecute(
    async () => {
      const result = await taio.taioAdvancedSearchTweets(query, queryType);
      return result.tweets.slice(0, limit).map(normalizeTweetFromTaio);
    },
    `advancedSearchTweets(${query})`,
    []
  );
}

/**
 * Check if user A follows user B
 */
export async function unifiedCheckFollowRelationship(
  sourceUsername: string,
  targetUsername: string
): Promise<boolean> {
  // Only TwitterAPI.io supports this directly
  try {
    return await taio.taioCheckFollowRelationship(sourceUsername, targetUsername);
  } catch (error) {
    console.warn(`[TwitterClient] checkFollowRelationship failed for ${sourceUsername} -> ${targetUsername}`);
    return false;
  }
}

/**
 * Get tweet retweeters
 */
export async function unifiedGetTweetRetweeters(
  tweetId: string,
  limit: number = 50
): Promise<UnifiedUserProfile[]> {
  try {
    const result = await taio.taioGetTweetRetweeters(tweetId);
    return result.users.slice(0, limit).map(normalizeFromTaio);
  } catch (error) {
    console.warn(`[TwitterClient] getTweetRetweeters failed for ${tweetId}`);
    return [];
  }
}

/**
 * Get tweet replies
 */
export async function unifiedGetTweetReplies(
  tweetId: string,
  limit: number = 50
): Promise<UnifiedTweet[]> {
  try {
    const result = await taio.taioGetTweetReplies(tweetId);
    return result.tweets.slice(0, limit).map(normalizeTweetFromTaio);
  } catch (error) {
    console.warn(`[TwitterClient] getTweetReplies failed for ${tweetId}`);
    return [];
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate follower quality score from a sample of user profiles.
 * Uses the unified profile type.
 * 
 * @param profiles - Array of unified user profiles
 * @returns Quality score 0-100
 */
export function calculateFollowerQuality(profiles: UnifiedUserProfile[]): number {
  if (profiles.length === 0) {
    return 50; // Default neutral
  }

  let totalScore = 0;

  for (const profile of profiles) {
    let profileScore = 0;

    // Factor 1: Follower count (0-30 points)
    const followers = profile.followers || 0;
    if (followers >= 10000) profileScore += 30;
    else if (followers >= 1000) profileScore += 20;
    else if (followers >= 100) profileScore += 10;
    else if (followers >= 10) profileScore += 5;

    // Factor 2: Verified status (0-25 points)
    if (profile.isVerified) profileScore += 25;

    // Factor 3: Account age based on tweet count heuristic (0-20 points)
    const tweets = profile.tweetCount || 0;
    if (tweets >= 1000) profileScore += 20;
    else if (tweets >= 100) profileScore += 10;
    else if (tweets >= 10) profileScore += 5;

    // Factor 4: Follower/following ratio (0-15 points)
    const following = profile.following || 1;
    const ratio = followers / following;
    if (ratio >= 10) profileScore += 15;
    else if (ratio >= 2) profileScore += 10;
    else if (ratio >= 0.5) profileScore += 5;

    // Factor 5: Bio presence (0-10 points)
    if (profile.bio && profile.bio.length > 20) profileScore += 10;
    else if (profile.bio && profile.bio.length > 0) profileScore += 5;

    totalScore += profileScore;
  }

  // Average and normalize to 0-100
  const avgScore = totalScore / profiles.length;
  return Math.round(Math.min(100, avgScore));
}

// =============================================================================
// MENTIONS (using TwitterAPI.io only - no RapidAPI fallback)
// =============================================================================

/**
 * Normalized mention result for unified API
 */
export interface UnifiedMention {
  id: string;
  text: string;
  author: string;
  url: string; // Full tweet URL from API
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
}

/**
 * Get tweets that mention a user.
 * Uses TwitterAPI.io's /twitter/user/mentions endpoint.
 * 
 * @param username - Twitter handle (without @)
 * @param limit - Maximum tweets to return
 */
export async function unifiedGetUserMentions(
  username: string,
  limit: number = 50
): Promise<UnifiedMention[]> {
  try {
    const mentions = await taio.taioGetUserMentions(username, limit);
    console.log(`[TwitterClient] getUserMentions(${username}) - using twitterapiio, got ${mentions.length} tweets`);
    
    return mentions.map(m => ({
      id: m.id,
      text: m.text,
      author: m.authorUsername || 'unknown',
      url: m.url || `https://x.com/${m.authorUsername || 'i'}/status/${m.id}`, // Use API URL or construct
      createdAt: m.createdAt,
      likeCount: m.likeCount,
      retweetCount: m.retweetCount,
      replyCount: m.replyCount,
    }));
  } catch (err) {
    console.error('[TwitterClient] getUserMentions error', err);
    // Return empty array instead of calling RapidAPI
    return [];
  }
}

/**
 * Fetch mentions for a project (by handle and/or name)
 * Returns normalized mention results compatible with the old RapidAPI format
 */
export async function fetchProjectMentionsViaTwitterApiIo(
  handle: string,
  limit: number = 100
): Promise<UnifiedMention[]> {
  const cleanHandle = handle.replace('@', '');
  return unifiedGetUserMentions(cleanHandle, limit);
}

/**
 * Calculate statistics from mentions
 */
export function calculateMentionStats(mentions: UnifiedMention[]): {
  count: number;
  totalLikes: number;
  totalRetweets: number;
  avgLikes: number;
  avgRetweets: number;
  uniqueAuthors: number;
} {
  if (mentions.length === 0) {
    return {
      count: 0,
      totalLikes: 0,
      totalRetweets: 0,
      avgLikes: 0,
      avgRetweets: 0,
      uniqueAuthors: 0,
    };
  }

  const authorSet = new Set<string>();
  let totalLikes = 0;
  let totalRetweets = 0;

  for (const mention of mentions) {
    totalLikes += mention.likeCount ?? 0;
    totalRetweets += mention.retweetCount ?? 0;
    authorSet.add(mention.author.toLowerCase());
  }

  return {
    count: mentions.length,
    totalLikes,
    totalRetweets,
    avgLikes: totalLikes / mentions.length,
    avgRetweets: totalRetweets / mentions.length,
    uniqueAuthors: authorSet.size,
  };
}

// =============================================================================
// RE-EXPORTS for convenience
// =============================================================================

export type { IUserInfo, ITweet, IMention } from './twitterapiio';
