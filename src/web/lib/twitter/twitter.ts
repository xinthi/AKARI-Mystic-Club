/**
 * Twitter Client for Next.js Web App
 * 
 * This is a self-contained Twitter client for use within the Next.js app (src/web).
 * Uses ONLY TwitterAPI.io as the data source (no RapidAPI).
 * 
 * Environment variables:
 * - TWITTERAPIIO_API_KEY: API key for TwitterAPI.io
 * - TWITTERAPIIO_BASE_URL: Base URL for TwitterAPI.io (default: https://api.twitterapi.io)
 * 
 * ⚠️ SERVER-SIDE ONLY - This file should only be imported in API routes!
 */

import axios from 'axios';

// =============================================================================
// CONFIGURATION
// =============================================================================

// TwitterAPI.io config
const TAIO_BASE_URL = process.env.TWITTERAPIIO_BASE_URL ?? 'https://api.twitterapi.io';
const TAIO_API_KEY = process.env.TWITTERAPIIO_API_KEY;

// Log configuration on first import (server-side only)
if (typeof window === 'undefined') {
  console.log(`[TwitterClient/Web] Provider: twitterapiio (exclusive)`);
  console.log(`[TwitterClient/Web] TWITTERAPIIO_API_KEY: ${TAIO_API_KEY ? 'SET' : 'NOT SET'}`);
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
// SAFE EXECUTION HELPER
// =============================================================================

/**
 * Execute with safe error handling - returns default value on failure
 */
async function safeExecute<T>(
  fn: () => Promise<T>,
  operation: string,
  defaultValue: T
): Promise<T> {
  try {
    const result = await fn();
    console.log(`[TwitterClient/Web] ${operation} - SUCCESS`);
    return result;
  } catch (err: any) {
    console.warn(`[TwitterClient/Web] ${operation} - FAILED: ${err.message}`);
    return defaultValue;
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
    throw new Error('[TwitterAPI.io] TWITTERAPIIO_API_KEY is not set');
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

  console.log('[TwitterAPI.io] Search response keys:', Object.keys(response));
  
  const users = extractArray(response, 'users', 'data', 'results', 'people');
  console.log('[TwitterAPI.io] Extracted users count:', users.length);
  
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
 * Check if a query looks like a username (not a general search term)
 */
function looksLikeUsername(query: string): boolean {
  const cleaned = query.replace('@', '').trim();
  // Username: alphanumeric + underscores, no spaces, 1-15 chars
  return /^[a-zA-Z0-9_]{1,15}$/.test(cleaned);
}

/**
 * Search for Twitter users by query
 * If the query looks like a username, tries direct lookup first for accuracy
 * Uses TwitterAPI.io exclusively
 */
export async function searchUsers(
  query: string,
  limit: number = 20
): Promise<TwitterUserProfile[]> {
  const cleanQuery = query.trim();
  
  // If query looks like a username, try direct lookup first
  if (looksLikeUsername(cleanQuery)) {
    console.log(`[TwitterClient/Web] Query "${cleanQuery}" looks like username, trying direct lookup first`);
    
    const directUser = await getUserProfile(cleanQuery);
    if (directUser && directUser.handle) {
      console.log(`[TwitterClient/Web] Direct lookup found: @${directUser.handle}`);
      // Return the direct match as first result, then search for similar
      const searchResults = await safeExecute(
        () => taioSearchUsers(cleanQuery, limit - 1),
        `searchUsers("${cleanQuery}")`,
        []
      );
      // Filter out the direct match from search results to avoid duplicates
      const filteredResults = searchResults.filter(
        u => u.handle.toLowerCase() !== directUser.handle.toLowerCase()
      );
      return [directUser, ...filteredResults].slice(0, limit);
    }
  }
  
  // Regular search
  return safeExecute(
    () => taioSearchUsers(cleanQuery, limit),
    `searchUsers("${cleanQuery}")`,
    []
  );
}

/**
 * Get user profile by handle
 * Uses TwitterAPI.io exclusively
 */
export async function getUserProfile(
  userName: string
): Promise<TwitterUserProfile | null> {
  const cleanHandle = userName.replace('@', '');
  
  return safeExecute(
    () => taioGetUserInfo(cleanHandle),
    `getUserProfile("${cleanHandle}")`,
    null
  );
}

/**
 * Get user's recent tweets
 * Uses TwitterAPI.io exclusively
 */
export async function getUserTweets(
  userName: string,
  limit: number = 10
): Promise<TwitterTweet[]> {
  const cleanHandle = userName.replace('@', '');

  return safeExecute(
    () => taioGetUserTweets(cleanHandle, limit),
    `getUserTweets("${cleanHandle}")`,
    []
  );
}
