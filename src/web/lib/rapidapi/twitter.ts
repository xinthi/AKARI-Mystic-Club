/**
 * Unified Twitter Client for Next.js Web App
 * 
 * This is a self-contained unified Twitter client for use within the Next.js app (src/web).
 * It supports both TwitterAPI.io and RapidAPI with automatic fallback.
 * 
 * Environment variables:
 * - TWITTER_PRIMARY_PROVIDER: "twitterapiio" or "rapidapi" (default: "twitterapiio")
 * - TWITTERAPIIO_API_KEY: API key for TwitterAPI.io
 * - TWITTERAPIIO_BASE_URL: Base URL for TwitterAPI.io (default: https://api.twitterapi.io)
 * - RAPIDAPI_KEY: API key for RapidAPI
 * - TWITTER_API65_AUTH_TOKEN: Auth token for twitter-api65 RapidAPI
 * 
 * ⚠️ SERVER-SIDE ONLY - This file should only be imported in API routes!
 */

import axios from 'axios';

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

const PRIMARY_PROVIDER: Provider = getPrimaryProvider();

// TwitterAPI.io config
const TAIO_BASE_URL = process.env.TWITTERAPIIO_BASE_URL ?? 'https://api.twitterapi.io';
const TAIO_API_KEY = process.env.TWITTERAPIIO_API_KEY;

// RapidAPI config
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const TWITTER_API_AUTH = process.env.TWITTER_API65_AUTH_TOKEN;
const TWITTER_API_HOST = 'twitter-api65.p.rapidapi.com';
const TWITTER_API_BASE = `https://${TWITTER_API_HOST}`;

// Log configuration on first import (server-side only)
if (typeof window === 'undefined') {
  console.log(`[TwitterClient/Web] Primary provider: ${PRIMARY_PROVIDER}`);
  console.log(`[TwitterClient/Web] TWITTERAPIIO_API_KEY: ${TAIO_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`[TwitterClient/Web] RAPIDAPI_KEY: ${RAPIDAPI_KEY ? 'SET' : 'NOT SET'}`);
}

// =============================================================================
// UNIFIED TYPE DEFINITIONS
// =============================================================================

/**
 * Unified Twitter user profile with guaranteed profileImageUrl
 */
export interface TwitterUserProfile {
  handle: string;
  userId?: string;
  name?: string;
  bio?: string;
  avatarUrl?: string;
  profileImageUrl?: string; // Alias for avatarUrl
  followersCount?: number;
  followingCount?: number;
  tweetCount?: number;
  createdAt?: string;
  verified?: boolean;
}

/**
 * Unified tweet type
 */
export interface TwitterTweet {
  id: string;
  text: string;
  authorHandle: string;
  createdAt: string;
  likeCount?: number;
  replyCount?: number;
  retweetCount?: number;
  quoteCount?: number;
}

// =============================================================================
// FALLBACK HELPER
// =============================================================================

/**
 * Execute with automatic fallback to secondary provider
 */
/**
 * Get secondary provider (opposite of primary)
 */
function getSecondaryProvider(): Provider {
  return PRIMARY_PROVIDER === 'twitterapiio' ? 'rapidapi' : 'twitterapiio';
}

/**
 * Execute with fallback - tries primary provider first, then secondary
 * Logs which provider was used for debugging
 */
async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  operation: string
): Promise<T> {
  const secondary = getSecondaryProvider();
  
  try {
    const result = await primary();
    console.log(`[TwitterClient] ${operation} - SUCCESS using primary: ${PRIMARY_PROVIDER}`);
    return result;
  } catch (err: any) {
    console.warn(`[TwitterClient] ${operation} - FAILED on primary (${PRIMARY_PROVIDER}): ${err.message}`);
    console.log(`[TwitterClient] ${operation} - Trying fallback: ${secondary}`);
    
    try {
      const result = await fallback();
      console.log(`[TwitterClient] ${operation} - SUCCESS using fallback: ${secondary}`);
      return result;
    } catch (err2: any) {
      console.error(`[TwitterClient] ${operation} - FAILED on fallback (${secondary}): ${err2.message}`);
      throw new Error(`Twitter API request failed for ${operation} - both providers failed`);
    }
  }
}

// =============================================================================
// TWITTERAPI.IO IMPLEMENTATION
// =============================================================================

/**
 * Build query string from params object
 */
function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  
  return entries.length > 0 ? `?${entries.join('&')}` : '';
}

/**
 * Make a GET request to TwitterAPI.io
 */
async function taioGet<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> {
  if (!TAIO_API_KEY) {
    throw new Error('[twitterapiio] TWITTERAPIIO_API_KEY is not set');
  }

  const url = `${TAIO_BASE_URL}${path}${buildQueryString(params)}`;

  const response = await axios.get<T>(url, {
    headers: {
      'X-API-Key': TAIO_API_KEY,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  return response.data;
}

/**
 * Search users via TwitterAPI.io
 */
async function taioSearchUsers(q: string, limit: number): Promise<TwitterUserProfile[]> {
  const response = await taioGet<Record<string, unknown>>('/twitter/user/search', {
    query: q,
    count: limit,
  });

  const users = extractArray(response, 'users', 'data', 'results', 'people');
  return users.map(normalizeTaioUser);
}

/**
 * Get user info via TwitterAPI.io
 */
async function taioGetUserInfo(userName: string): Promise<TwitterUserProfile | null> {
  try {
    const response = await taioGet<Record<string, unknown>>('/twitter/user/info', {
      userName: userName.replace('@', ''),
    });

    const userData = (response.data as Record<string, unknown>) ?? response;
    if (!userData || (!userData.id && !userData.userName)) {
      return null;
    }

    return normalizeTaioUser(userData);
  } catch {
    return null;
  }
}

/**
 * Get user tweets via TwitterAPI.io
 */
async function taioGetUserTweets(userName: string, limit: number): Promise<TwitterTweet[]> {
  const response = await taioGet<Record<string, unknown>>('/twitter/user/last_tweets', {
    userName: userName.replace('@', ''),
    count: limit,
  });

  const tweets = extractArray(response, 'tweets', 'data', 'results', 'timeline');
  return tweets.map(normalizeTaioTweet);
}

/**
 * Normalize TwitterAPI.io user to unified format
 */
function normalizeTaioUser(raw: Record<string, unknown>): TwitterUserProfile {
  const profileImageUrl = 
    raw.profileImageUrl as string ??
    raw.profile_image_url as string ??
    raw.profilePicture as string ??
    raw.profile_picture as string ??
    raw.avatar_url as string ??
    raw.avatarUrl as string;

  return {
    handle: String(raw.userName ?? raw.username ?? raw.screen_name ?? ''),
    userId: String(raw.id ?? raw.userId ?? ''),
    name: String(raw.name ?? raw.displayName ?? ''),
    bio: raw.description as string ?? raw.bio as string,
    avatarUrl: profileImageUrl,
    profileImageUrl: profileImageUrl,
    followersCount: raw.followers as number ?? raw.followersCount as number ?? raw.followers_count as number,
    followingCount: raw.following as number ?? raw.followingCount as number ?? raw.friends_count as number,
    tweetCount: raw.statusesCount as number ?? raw.statuses_count as number ?? raw.tweetCount as number,
    createdAt: raw.createdAt as string ?? raw.created_at as string,
    verified: raw.isBlueVerified as boolean ?? raw.is_blue_verified as boolean ?? raw.verified as boolean,
  };
}

/**
 * Normalize TwitterAPI.io tweet to unified format
 */
function normalizeTaioTweet(raw: Record<string, unknown>): TwitterTweet {
  const author = raw.author as Record<string, unknown> | undefined;
  return {
    id: String(raw.id ?? raw.tweetId ?? ''),
    text: String(raw.text ?? raw.full_text ?? ''),
    authorHandle: author?.userName as string ?? author?.username as string ?? '',
    createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
    likeCount: raw.likeCount as number ?? raw.like_count as number ?? raw.favoriteCount as number,
    replyCount: raw.replyCount as number ?? raw.reply_count as number,
    retweetCount: raw.retweetCount as number ?? raw.retweet_count as number,
    quoteCount: raw.quoteCount as number ?? raw.quote_count as number,
  };
}

// =============================================================================
// RAPIDAPI IMPLEMENTATION
// =============================================================================

/**
 * POST request to twitter-api65 RapidAPI
 */
async function rapidApiPost<T>(path: string, body: unknown): Promise<T> {
  if (!RAPIDAPI_KEY) {
    throw new Error('RAPIDAPI_KEY environment variable is not set');
  }

  const res = await axios.post<T>(`${TWITTER_API_BASE}${path}`, body, {
    headers: {
      'Authorization': TWITTER_API_AUTH ?? '',
      'Content-Type': 'application/json',
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': TWITTER_API_HOST,
    },
    timeout: 30000,
  });

  return res.data;
}

/**
 * Search users via RapidAPI
 */
async function rapidSearchUsers(q: string, limit: number): Promise<TwitterUserProfile[]> {
  const response = await rapidApiPost<unknown>('/search', {
    query: q,
    type: 'People',
  });

  const users = extractArray(response as Record<string, unknown>, 'users', 'people', 'results', 'data');
  return users.map(normalizeRapidUser).slice(0, limit);
}

/**
 * Get user info via RapidAPI
 */
async function rapidGetUserInfo(userName: string): Promise<TwitterUserProfile | null> {
  try {
    const response = await rapidApiPost<unknown>('/user-details-by-screen-name', {
      username: userName.replace('@', ''),
    });

    const data = response as Record<string, unknown>;
    const userData = (data.data as Record<string, unknown>) ?? 
                     (data.user as Record<string, unknown>) ?? 
                     data;

    if (!userData || (!userData.id && !userData.screen_name)) {
      return null;
    }

    return normalizeRapidUser(userData);
  } catch {
    return null;
  }
}

/**
 * Normalize RapidAPI user to unified format
 */
function normalizeRapidUser(raw: Record<string, unknown>): TwitterUserProfile {
  const legacy = raw.legacy as Record<string, unknown> | undefined;
  
  const handle = raw.screen_name ?? raw.username ?? legacy?.screen_name ?? '';
  const profileImageUrl = 
    raw.profile_image_url_https as string ??
    raw.profile_image_url as string ??
    raw.avatar_url as string ??
    legacy?.profile_image_url_https as string;

  let createdAt = raw.created_at as string ?? legacy?.created_at as string;
  if (createdAt) {
    try {
      createdAt = new Date(createdAt).toISOString();
    } catch {
      // Keep original
    }
  }

  return {
    handle: String(handle),
    userId: String(raw.id ?? raw.id_str ?? raw.rest_id ?? ''),
    name: raw.name as string ?? legacy?.name as string,
    bio: raw.description as string ?? raw.bio as string ?? legacy?.description as string,
    avatarUrl: profileImageUrl,
    profileImageUrl: profileImageUrl,
    followersCount: raw.followers_count as number ?? raw.followersCount as number ?? legacy?.followers_count as number,
    followingCount: raw.friends_count as number ?? raw.following_count as number ?? legacy?.friends_count as number,
    tweetCount: raw.statuses_count as number ?? raw.tweet_count as number ?? legacy?.statuses_count as number,
    createdAt,
    verified: raw.verified as boolean ?? raw.is_blue_verified as boolean ?? legacy?.verified as boolean,
  };
}

// =============================================================================
// SHARED HELPERS
// =============================================================================

/**
 * Extract array from API response
 */
function extractArray(
  data: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown>[] {
  // If data itself is an array
  if (Array.isArray(data)) {
    return data;
  }

  // Try each key
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  // Try nested data/result objects
  if (data.data && typeof data.data === 'object') {
    return extractArray(data.data as Record<string, unknown>, ...keys);
  }
  if (data.result && typeof data.result === 'object') {
    return extractArray(data.result as Record<string, unknown>, ...keys);
  }

  return [];
}

// =============================================================================
// UNIFIED PUBLIC API
// =============================================================================

/**
 * Search for Twitter users by query
 * Uses primary provider with automatic fallback
 */
export async function searchUsers(
  query: string,
  limit: number = 20
): Promise<TwitterUserProfile[]> {
  if (PRIMARY_PROVIDER === 'twitterapiio') {
    return withFallback(
      () => taioSearchUsers(query, limit),
      () => rapidSearchUsers(query, limit),
      `searchUsers("${query}")`
    );
  } else {
    return withFallback(
      () => rapidSearchUsers(query, limit),
      () => taioSearchUsers(query, limit),
      `searchUsers("${query}")`
    );
  }
}

/**
 * Get user profile by handle
 * Uses primary provider with automatic fallback
 */
export async function getUserProfile(
  userName: string
): Promise<TwitterUserProfile | null> {
  const cleanHandle = userName.replace('@', '');

  if (PRIMARY_PROVIDER === 'twitterapiio') {
    return withFallback(
      () => taioGetUserInfo(cleanHandle),
      () => rapidGetUserInfo(cleanHandle),
      `getUserProfile("${cleanHandle}")`
    );
  } else {
    return withFallback(
      () => rapidGetUserInfo(cleanHandle),
      () => taioGetUserInfo(cleanHandle),
      `getUserProfile("${cleanHandle}")`
    );
  }
}

/**
 * Get user's recent tweets
 * Uses primary provider with automatic fallback
 */
export async function getUserTweets(
  userName: string,
  limit: number = 10
): Promise<TwitterTweet[]> {
  const cleanHandle = userName.replace('@', '');

  // For now, only TwitterAPI.io supports this cleanly
  // RapidAPI would need additional implementation
  if (PRIMARY_PROVIDER === 'twitterapiio' || !RAPIDAPI_KEY) {
    return taioGetUserTweets(cleanHandle, limit);
  }

  // Fallback to TwitterAPI.io if RapidAPI fails
  try {
    return await taioGetUserTweets(cleanHandle, limit);
  } catch {
    console.warn(`[twitterClient] getUserTweets fallback not fully implemented`);
    return [];
  }
}
