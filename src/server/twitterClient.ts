/**
 * Unified Twitter Client
 * 
 * This module provides a unified interface for Twitter data,
 * supporting both TwitterAPI.io and RapidAPI providers.
 * 
 * Features:
 * - Configurable primary provider via TWITTER_PRIMARY_PROVIDER env var
 * - Automatic fallback to secondary provider on failure
 * - Consistent data normalization across providers
 * - Profile images always included (profileImageUrl)
 * 
 * Usage:
 *   import { unifiedGetUserInfo, unifiedSearchUsers } from '@/server/twitterClient';
 */

import * as taio from './twitterapiio';
import * as rapidapi from './rapidapi/twitter';

// =============================================================================
// CONFIGURATION
// =============================================================================

type Provider = 'twitterapiio' | 'rapidapi';

/**
 * Get the primary Twitter provider from environment
 * Defaults to 'twitterapiio' if not set or invalid
 */
function getPrimaryProvider(): Provider {
  const raw = process.env.TWITTER_PRIMARY_PROVIDER?.toLowerCase().trim();
  if (raw === 'rapidapi') return 'rapidapi';
  return 'twitterapiio'; // Default to twitterapiio
}

const TWITTER_PRIMARY_PROVIDER: Provider = getPrimaryProvider();

// Log configuration on module load
console.log(`[TwitterClient] Primary provider: ${TWITTER_PRIMARY_PROVIDER}`);
console.log(`[TwitterClient] TWITTERAPIIO_API_KEY: ${process.env.TWITTERAPIIO_API_KEY ? 'SET' : 'NOT SET'}`);
console.log(`[TwitterClient] RAPIDAPI_KEY: ${process.env.RAPIDAPI_KEY ? 'SET' : 'NOT SET'}`);

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
 * Convert RapidAPI user to unified format
 */
function normalizeFromRapidApi(user: rapidapi.TwitterUserProfile): UnifiedUserProfile {
  return {
    id: user.userId || '',
    username: user.handle,
    name: user.name || '',
    profileImageUrl: user.avatarUrl?.replace('_normal', '_400x400') || '',
    bio: user.bio || '',
    followers: user.followersCount || 0,
    following: user.followingCount || 0,
    tweetCount: user.tweetCount || 0,
    isVerified: user.verified || false,
    verifiedType: null,
    createdAt: user.createdAt || '',
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

/**
 * Convert RapidAPI tweet to unified format
 */
function normalizeTweetFromRapidApi(tweet: rapidapi.TwitterTweet): UnifiedTweet {
  return {
    id: tweet.id,
    text: tweet.text,
    authorId: '',
    authorUsername: tweet.authorHandle,
    authorName: '',
    authorProfileImageUrl: '',
    createdAt: tweet.createdAt,
    likeCount: tweet.likeCount || 0,
    replyCount: tweet.replyCount || 0,
    retweetCount: tweet.retweetCount || 0,
    quoteCount: 0,
    viewCount: 0,
    isRetweet: false,
    isReply: false,
  };
}

// =============================================================================
// FALLBACK HELPER
// =============================================================================

/**
 * Get the secondary provider (opposite of primary)
 */
function getSecondaryProvider(): Provider {
  return TWITTER_PRIMARY_PROVIDER === 'twitterapiio' ? 'rapidapi' : 'twitterapiio';
}

/**
 * Execute with fallback: tries primary provider first, then secondary
 * Logs which provider was used for debugging
 */
async function withFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
  operation: string
): Promise<T> {
  const primary = TWITTER_PRIMARY_PROVIDER;
  const secondary = getSecondaryProvider();

  try {
    const result = await primaryFn();
    console.log(`[TwitterClient] ${operation} - SUCCESS using primary: ${primary}`);
    return result;
  } catch (primaryError: any) {
    console.warn(`[TwitterClient] ${operation} - FAILED on primary (${primary}): ${primaryError.message}`);
    console.log(`[TwitterClient] ${operation} - Trying fallback: ${secondary}`);
    
    try {
      const result = await fallbackFn();
      console.log(`[TwitterClient] ${operation} - SUCCESS using fallback: ${secondary}`);
      return result;
    } catch (fallbackError: any) {
      console.error(`[TwitterClient] ${operation} - FAILED on fallback (${secondary}): ${fallbackError.message}`);
      throw new Error(`Twitter API request failed for ${operation} - both providers failed`);
    }
  }
}

// =============================================================================
// UNIFIED API FUNCTIONS
// =============================================================================

/**
 * Search for Twitter users by query
 */
export async function unifiedSearchUsers(query: string, limit: number = 10): Promise<UnifiedUserProfile[]> {
  const taioSearch = async (): Promise<UnifiedUserProfile[]> => {
    const users = await taio.taioSearchUser(query);
    return users.slice(0, limit).map(normalizeFromTaio);
  };

  const rapidapiSearch = async (): Promise<UnifiedUserProfile[]> => {
    const users = await rapidapi.searchUsers({ query, type: 'Top', limit });
    return users.map(normalizeFromRapidApi);
  };

  if (TWITTER_PRIMARY_PROVIDER === 'twitterapiio') {
    return withFallback(taioSearch, rapidapiSearch, `searchUsers(${query})`);
  } else {
    return withFallback(rapidapiSearch, taioSearch, `searchUsers(${query})`);
  }
}

/**
 * Get user info by username
 */
export async function unifiedGetUserInfo(username: string): Promise<UnifiedUserProfile | null> {
  const taioFetch = async (): Promise<UnifiedUserProfile | null> => {
    const user = await taio.taioGetUserInfo(username);
    return user ? normalizeFromTaio(user) : null;
  };

  const rapidapiFetch = async (): Promise<UnifiedUserProfile | null> => {
    const user = await rapidapi.fetchUserProfile(username);
    return user ? normalizeFromRapidApi(user) : null;
  };

  if (TWITTER_PRIMARY_PROVIDER === 'twitterapiio') {
    return withFallback(taioFetch, rapidapiFetch, `getUserInfo(${username})`);
  } else {
    return withFallback(rapidapiFetch, taioFetch, `getUserInfo(${username})`);
  }
}

/**
 * Get user's last tweets
 */
export async function unifiedGetUserLastTweets(
  username: string,
  limit: number = 50
): Promise<UnifiedTweet[]> {
  const taioFetch = async (): Promise<UnifiedTweet[]> => {
    const result = await taio.taioGetUserLastTweets(username);
    return result.tweets.slice(0, limit).map(normalizeTweetFromTaio);
  };

  const rapidapiFetch = async (): Promise<UnifiedTweet[]> => {
    const tweets = await rapidapi.fetchUserTweets(username, limit);
    return tweets.map(normalizeTweetFromRapidApi);
  };

  if (TWITTER_PRIMARY_PROVIDER === 'twitterapiio') {
    return withFallback(taioFetch, rapidapiFetch, `getUserLastTweets(${username})`);
  } else {
    return withFallback(rapidapiFetch, taioFetch, `getUserLastTweets(${username})`);
  }
}

/**
 * Get user's followers
 */
export async function unifiedGetUserFollowers(
  username: string,
  limit: number = 100
): Promise<UnifiedUserProfile[]> {
  const taioFetch = async (): Promise<UnifiedUserProfile[]> => {
    // Request more than limit to account for filtering/deduplication
    const pageSize = Math.min(500, Math.max(200, limit));
    const result = await taio.taioGetUserFollowers(username, pageSize);
    
    // If we got 0 followers, treat this as an error to trigger fallback
    if (result.users.length === 0) {
      console.warn(`[TwitterClient] taioGetUserFollowers returned 0 followers for @${username}`);
      throw new Error(`No followers returned for @${username}`);
    }
    
    return result.users.slice(0, limit).map(normalizeFromTaio);
  };

  const rapidapiFetch = async (): Promise<UnifiedUserProfile[]> => {
    const users = await rapidapi.fetchUserFollowersSample(username, limit);
    return users.map(normalizeFromRapidApi);
  };

  if (TWITTER_PRIMARY_PROVIDER === 'twitterapiio') {
    return withFallback(taioFetch, rapidapiFetch, `getUserFollowers(${username})`);
  } else {
    return withFallback(rapidapiFetch, taioFetch, `getUserFollowers(${username})`);
  }
}

/**
 * Get user's verified followers
 */
export async function unifiedGetUserVerifiedFollowers(
  username: string,
  limit: number = 50
): Promise<UnifiedUserProfile[]> {
  const taioFetch = async (): Promise<UnifiedUserProfile[]> => {
    const pageSize = Math.min(200, Math.max(100, limit));
    const result = await taio.taioGetUserVerifiedFollowers(username, pageSize);
    return result.users.slice(0, limit).map(normalizeFromTaio);
  };

  const rapidapiFetch = async (): Promise<UnifiedUserProfile[]> => {
    // RapidAPI doesn't have a dedicated verified followers endpoint
    // Fall back to regular followers
    const users = await rapidapi.fetchUserFollowersSample(username, limit * 2);
    // Filter for verified users
    return users.filter(u => u.verified).slice(0, limit).map(normalizeFromRapidApi);
  };

  if (TWITTER_PRIMARY_PROVIDER === 'twitterapiio') {
    return withFallback(taioFetch, rapidapiFetch, `getUserVerifiedFollowers(${username})`);
  } else {
    return withFallback(rapidapiFetch, taioFetch, `getUserVerifiedFollowers(${username})`);
  }
}

/**
 * Advanced search for tweets
 */
export async function unifiedAdvancedSearchTweets(
  query: string,
  queryType: 'Latest' | 'Top' = 'Latest',
  limit: number = 50
): Promise<UnifiedTweet[]> {
  const taioFetch = async (): Promise<UnifiedTweet[]> => {
    const result = await taio.taioAdvancedSearchTweets(query, queryType);
    return result.tweets.slice(0, limit).map(normalizeTweetFromTaio);
  };

  const rapidapiFetch = async (): Promise<UnifiedTweet[]> => {
    const tweets = await rapidapi.searchTweets({ query, type: queryType, limit });
    return tweets.map(normalizeTweetFromRapidApi);
  };

  if (TWITTER_PRIMARY_PROVIDER === 'twitterapiio') {
    return withFallback(taioFetch, rapidapiFetch, `advancedSearchTweets(${query})`);
  } else {
    return withFallback(rapidapiFetch, taioFetch, `advancedSearchTweets(${query})`);
  }
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
export type { TwitterUserProfile, TwitterTweet } from './rapidapi/twitter';
