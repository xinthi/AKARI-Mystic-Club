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

const TWITTER_PRIMARY_PROVIDER: Provider = 
  (process.env.TWITTER_PRIMARY_PROVIDER as Provider) || 'rapidapi';

console.log(`[TwitterClient] Primary provider: ${TWITTER_PRIMARY_PROVIDER}`);

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
 * Execute with fallback: tries primary provider first, then secondary
 */
async function withFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
  errorMessage: string
): Promise<T> {
  try {
    return await primaryFn();
  } catch (primaryError) {
    console.warn(`[TwitterClient] Primary provider failed, trying fallback: ${errorMessage}`);
    try {
      return await fallbackFn();
    } catch (fallbackError) {
      console.error(`[TwitterClient] Both providers failed for: ${errorMessage}`);
      throw new Error(`Twitter API request failed: ${errorMessage}`);
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
    const result = await taio.taioGetUserFollowers(username);
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
    const result = await taio.taioGetUserVerifiedFollowers(username);
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
// RE-EXPORTS for convenience
// =============================================================================

export type { IUserInfo, ITweet } from './twitterapiio';
export type { TwitterUserProfile, TwitterTweet } from './rapidapi/twitter';
