/**
 * Web-Local Twitter API Helper
 * 
 * This is a self-contained version of the Twitter API helpers for use within
 * the Next.js app (src/web). It's separate from src/server/rapidapi/twitter.ts
 * to allow Next.js/Webpack to transpile it properly.
 * 
 * ⚠️ SERVER-SIDE ONLY - This file should only be imported in API routes!
 */

import axios from 'axios';

// =============================================================================
// CONFIGURATION
// =============================================================================

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const TWITTER_API_AUTH = process.env.TWITTER_API65_AUTH_TOKEN;

const TWITTER_API_HOST = 'twitter-api65.p.rapidapi.com';
const TWITTER_API_BASE = `https://${TWITTER_API_HOST}`;

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Normalized Twitter user profile
 */
export interface TwitterUserProfile {
  handle: string;
  userId?: string;
  name?: string;
  bio?: string;
  avatarUrl?: string;
  followersCount?: number;
  followingCount?: number;
  tweetCount?: number;
  createdAt?: string;
  verified?: boolean;
}

/**
 * Raw API response shape (internal use only)
 */
interface RawTwitterApiUser {
  id?: number | string;
  id_str?: string;
  rest_id?: string;
  screen_name?: string;
  username?: string;
  name?: string;
  description?: string;
  bio?: string;
  profile_image_url_https?: string;
  profile_image_url?: string;
  avatar_url?: string;
  followers_count?: number;
  followersCount?: number;
  friends_count?: number;
  following_count?: number;
  followingCount?: number;
  statuses_count?: number;
  tweet_count?: number;
  created_at?: string;
  verified?: boolean;
  is_blue_verified?: boolean;
  legacy?: {
    screen_name?: string;
    name?: string;
    description?: string;
    profile_image_url_https?: string;
    followers_count?: number;
    friends_count?: number;
    statuses_count?: number;
    created_at?: string;
    verified?: boolean;
  };
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * POST request to twitter-api65
 */
async function twitterApiPost<T>(path: string, body: unknown): Promise<T> {
  if (!RAPIDAPI_KEY) {
    throw new Error('RAPIDAPI_KEY environment variable is not set');
  }

  try {
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
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: unknown }; message?: string };
    console.error(
      `[twitter-api65] ${path} failed`,
      axiosError.response?.data ?? axiosError.message
    );
    throw new Error(`twitter-api65 request failed for ${path}`);
  }
}

/**
 * Extract array from potentially nested response
 */
function extractArrayFromResponse(data: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    
    // Try each key in order
    for (const key of keys) {
      const value = record[key];
      if (Array.isArray(value)) {
        return value;
      }
    }

    // Try nested structures
    if (record.data && typeof record.data === 'object') {
      return extractArrayFromResponse(record.data, ...keys);
    }
    if (record.result && typeof record.result === 'object') {
      return extractArrayFromResponse(record.result, ...keys);
    }
  }

  return [];
}

/**
 * Normalize raw API user data to TwitterUserProfile
 */
function normalizeUserFromApi(raw: unknown): TwitterUserProfile | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as RawTwitterApiUser;
  
  // Handle nested legacy structure
  const legacy = data.legacy;

  // Extract handle - required
  const handle = data.screen_name || data.username || legacy?.screen_name;
  if (!handle) {
    return null;
  }

  // Extract userId
  const userId = data.id?.toString() || data.id_str || data.rest_id;

  // Normalize created_at to ISO string if possible
  let createdAt = data.created_at || legacy?.created_at;
  if (createdAt) {
    try {
      createdAt = new Date(createdAt).toISOString();
    } catch {
      // Keep original if parsing fails
    }
  }

  return {
    handle: String(handle),
    userId: userId ? String(userId) : undefined,
    name: data.name || legacy?.name,
    bio: data.description || data.bio || legacy?.description,
    avatarUrl: data.profile_image_url_https || data.profile_image_url || data.avatar_url || legacy?.profile_image_url_https,
    followersCount: data.followers_count ?? data.followersCount ?? legacy?.followers_count,
    followingCount: data.friends_count ?? data.following_count ?? data.followingCount ?? legacy?.friends_count,
    tweetCount: data.statuses_count ?? data.tweet_count ?? legacy?.statuses_count,
    createdAt,
    verified: data.verified ?? data.is_blue_verified ?? legacy?.verified,
  };
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Search for Twitter users by query.
 * Uses twitter-api65 /search endpoint with type "People".
 * 
 * @param query - Search query string
 * @param limit - Maximum results to return (default 20)
 * @returns Array of normalized user profiles
 */
export async function searchUsers(
  query: string,
  limit: number = 20
): Promise<TwitterUserProfile[]> {
  const response = await twitterApiPost<unknown>('/search', {
    query,
    type: 'People',
  });

  const rawUsers = extractArrayFromResponse(response, 'users', 'people', 'results', 'data');
  
  const users: TwitterUserProfile[] = [];
  for (const rawUser of rawUsers) {
    const normalized = normalizeUserFromApi(rawUser);
    if (normalized) {
      users.push(normalized);
    }
  }

  return users.slice(0, limit);
}

