/**
 * TwitterAPI.io Client
 * 
 * This module provides a client for TwitterAPI.io service.
 * Used as primary or fallback provider for Twitter data.
 */

import axios from 'axios';

// =============================================================================
// CONFIGURATION
// =============================================================================

const TAIO_API_KEY = process.env.TWITTERAPIIO_API_KEY;
const TAIO_BASE_URL = process.env.TWITTERAPIIO_BASE_URL || 'https://api.twitterapi.io';

// Log configuration on module load (only key presence, not the actual key)
if (!TAIO_API_KEY) {
  console.warn('[TwitterAPI.io] TWITTERAPIIO_API_KEY is NOT configured - requests will fail');
}

// =============================================================================
// TYPES
// =============================================================================

export interface IUserInfo {
  id: string;
  username: string;
  name: string;
  profileImageUrl: string;
  description: string;
  followers: number;
  following: number;
  tweetCount: number;
  isBlueVerified: boolean;
  verifiedType: string | null;
  createdAt: string;
}

export interface ITweet {
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

interface TaioResponse<T> {
  status: string;
  data: T;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Base helper for TwitterAPI.io GET requests
 */
async function taioGet<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  if (!TAIO_API_KEY) {
    console.error('[TwitterAPI.io] Missing TWITTERAPIIO_API_KEY - cannot make API request');
    throw new Error('TwitterAPI.io API key not configured');
  }

  try {
    const res = await axios.get<TaioResponse<T>>(`${TAIO_BASE_URL}${path}`, {
      params,
      headers: {
        'X-API-Key': TAIO_API_KEY,
      },
    });

    if (res.data.status !== 'success') {
      throw new Error(`TwitterAPI.io request failed: ${res.data.status}`);
    }

    return res.data.data;
  } catch (error: any) {
    console.error(`[TwitterAPI.io] GET ${path} failed`, error?.response?.data ?? error?.message);
    throw new Error(`TwitterAPI.io request failed for ${path}`);
  }
}

/**
 * Base helper for TwitterAPI.io POST requests
 */
async function taioPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!TAIO_API_KEY) {
    console.error('[TwitterAPI.io] Missing TWITTERAPIIO_API_KEY - cannot make API request');
    throw new Error('TwitterAPI.io API key not configured');
  }

  try {
    const res = await axios.post<TaioResponse<T>>(`${TAIO_BASE_URL}${path}`, body, {
      headers: {
        'X-API-Key': TAIO_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (res.data.status !== 'success') {
      throw new Error(`TwitterAPI.io request failed: ${res.data.status}`);
    }

    return res.data.data;
  } catch (error: any) {
    console.error(`[TwitterAPI.io] POST ${path} failed`, error?.response?.data ?? error?.message);
    throw new Error(`TwitterAPI.io request failed for ${path}`);
  }
}

/**
 * Normalize raw user data from API to IUserInfo
 */
function normalizeUser(raw: any): IUserInfo {
  return {
    id: String(raw.id ?? raw.user_id ?? ''),
    username: raw.screen_name ?? raw.username ?? '',
    name: raw.name ?? '',
    profileImageUrl: (raw.profile_image_url_https ?? raw.profile_image_url ?? '')
      .replace('_normal', '_400x400'),
    description: raw.description ?? '',
    followers: Number(raw.followers_count ?? raw.followers ?? 0),
    following: Number(raw.friends_count ?? raw.following ?? 0),
    tweetCount: Number(raw.statuses_count ?? raw.tweet_count ?? 0),
    isBlueVerified: Boolean(raw.is_blue_verified ?? raw.verified ?? false),
    verifiedType: raw.verified_type ?? null,
    createdAt: raw.created_at ?? '',
  };
}

/**
 * Normalize raw tweet data from API to ITweet
 */
function normalizeTweet(raw: any): ITweet {
  const author = raw.user ?? raw.author ?? {};
  return {
    id: String(raw.id ?? raw.tweet_id ?? ''),
    text: raw.full_text ?? raw.text ?? '',
    authorId: String(author.id ?? raw.user_id ?? ''),
    authorUsername: author.screen_name ?? author.username ?? raw.author_username ?? '',
    authorName: author.name ?? raw.author_name ?? '',
    authorProfileImageUrl: (author.profile_image_url_https ?? author.profile_image_url ?? '')
      .replace('_normal', '_400x400'),
    createdAt: raw.created_at ?? '',
    likeCount: Number(raw.favorite_count ?? raw.like_count ?? 0),
    replyCount: Number(raw.reply_count ?? 0),
    retweetCount: Number(raw.retweet_count ?? 0),
    quoteCount: Number(raw.quote_count ?? 0),
    viewCount: Number(raw.views ?? raw.view_count ?? 0),
    isRetweet: Boolean(raw.retweeted_status || raw.is_retweet),
    isReply: Boolean(raw.in_reply_to_status_id || raw.is_reply),
  };
}

// =============================================================================
// PUBLIC API FUNCTIONS
// =============================================================================

/**
 * Get user info by username
 */
export async function taioGetUserInfo(username: string): Promise<IUserInfo | null> {
  try {
    const raw = await taioGet<any>('/twitter/user/info', { userName: username });
    return normalizeUser(raw);
  } catch (error) {
    console.error('[TwitterAPI.io] taioGetUserInfo failed for', username, error);
    return null;
  }
}

/**
 * Get user info by ID
 */
export async function taioGetUserInfoById(userId: string): Promise<IUserInfo | null> {
  try {
    const raw = await taioGet<any>('/twitter/user/info_by_id', { userId });
    return normalizeUser(raw);
  } catch (error) {
    console.error('[TwitterAPI.io] taioGetUserInfoById failed for', userId, error);
    return null;
  }
}

/**
 * Batch get user info by IDs
 */
export async function taioBatchGetUserInfoByIds(userIds: string[]): Promise<IUserInfo[]> {
  try {
    const results: IUserInfo[] = [];
    // Process in batches of 100
    for (let i = 0; i < userIds.length; i += 100) {
      const batch = userIds.slice(i, i + 100);
      const raw = await taioPost<any[]>('/twitter/user/batch_info_by_id', { userIds: batch });
      results.push(...(raw ?? []).map(normalizeUser));
    }
    return results;
  } catch (error) {
    console.error('[TwitterAPI.io] taioBatchGetUserInfoByIds failed', error);
    return [];
  }
}

/**
 * Get user's followers
 */
export async function taioGetUserFollowers(
  username: string,
  cursor?: string
): Promise<{ users: IUserInfo[]; nextCursor: string | null }> {
  try {
    const params: Record<string, string | number> = { userName: username };
    if (cursor) params.cursor = cursor;
    
    const raw = await taioGet<any>('/twitter/user/followers', params);
    
    // Handle various response formats
    let rawUsers: any[] = [];
    if (raw?.followers && Array.isArray(raw.followers)) {
      rawUsers = raw.followers;
    } else if (raw?.users && Array.isArray(raw.users)) {
      rawUsers = raw.users;
    } else if (raw?.data && Array.isArray(raw.data)) {
      rawUsers = raw.data;
    } else if (Array.isArray(raw)) {
      rawUsers = raw;
    }
    
    const users = rawUsers.map((u: any) => normalizeUser(u));
    
    return {
      users,
      nextCursor: raw?.next_cursor ?? raw?.cursor ?? null,
    };
  } catch (error) {
    console.error('[TwitterAPI.io] taioGetUserFollowers failed', error);
    return { users: [], nextCursor: null };
  }
}

/**
 * Get user's verified followers
 */
export async function taioGetUserVerifiedFollowers(
  username: string,
  cursor?: string
): Promise<{ users: IUserInfo[]; nextCursor: string | null }> {
  try {
    const params: Record<string, string | number> = { userName: username };
    if (cursor) params.cursor = cursor;
    
    const raw = await taioGet<any>('/twitter/user/verified_followers', params);
    
    // Handle various response formats
    let rawUsers: any[] = [];
    if (raw?.followers && Array.isArray(raw.followers)) {
      rawUsers = raw.followers;
    } else if (raw?.users && Array.isArray(raw.users)) {
      rawUsers = raw.users;
    } else if (raw?.data && Array.isArray(raw.data)) {
      rawUsers = raw.data;
    } else if (Array.isArray(raw)) {
      rawUsers = raw;
    }
    
    const users = rawUsers.map((u: any) => normalizeUser(u));
    
    return {
      users,
      nextCursor: raw?.next_cursor ?? raw?.cursor ?? null,
    };
  } catch (error) {
    console.error('[TwitterAPI.io] taioGetUserVerifiedFollowers failed', error);
    return { users: [], nextCursor: null };
  }
}

/**
 * Search for users by query
 */
export async function taioSearchUser(query: string): Promise<IUserInfo[]> {
  try {
    const raw = await taioGet<any[]>('/twitter/user/search', { query });
    return (raw ?? []).map(normalizeUser);
  } catch (error) {
    console.error('[TwitterAPI.io] taioSearchUser failed', error);
    return [];
  }
}

/**
 * Get user's last tweets
 */
export async function taioGetUserLastTweets(
  username: string,
  cursor?: string
): Promise<{ tweets: ITweet[]; nextCursor: string | null }> {
  try {
    const params: Record<string, string | number> = { userName: username };
    if (cursor) params.cursor = cursor;
    
    const raw = await taioGet<any>('/twitter/user/last_tweets', params);
    const tweets = (raw.tweets ?? raw ?? []).map((t: any) => normalizeTweet(t));
    
    return {
      tweets,
      nextCursor: raw.next_cursor ?? null,
    };
  } catch (error) {
    console.error('[TwitterAPI.io] taioGetUserLastTweets failed', error);
    return { tweets: [], nextCursor: null };
  }
}

/**
 * Advanced search for tweets
 */
export async function taioAdvancedSearchTweets(
  query: string,
  queryType: 'Latest' | 'Top' = 'Latest',
  cursor?: string
): Promise<{ tweets: ITweet[]; nextCursor: string | null }> {
  try {
    const body: Record<string, unknown> = { query, queryType };
    if (cursor) body.cursor = cursor;
    
    const raw = await taioPost<any>('/twitter/tweet/advanced_search', body);
    const tweets = (raw.tweets ?? raw ?? []).map((t: any) => normalizeTweet(t));
    
    return {
      tweets,
      nextCursor: raw.next_cursor ?? null,
    };
  } catch (error) {
    console.error('[TwitterAPI.io] taioAdvancedSearchTweets failed', error);
    return { tweets: [], nextCursor: null };
  }
}

/**
 * Check if user A follows user B
 */
export async function taioCheckFollowRelationship(
  sourceUsername: string,
  targetUsername: string
): Promise<boolean> {
  try {
    const raw = await taioGet<any>('/twitter/user/check_follow', {
      sourceUserName: sourceUsername,
      targetUserName: targetUsername,
    });
    return Boolean(raw.is_following ?? raw);
  } catch (error) {
    console.error('[TwitterAPI.io] taioCheckFollowRelationship failed', error);
    return false;
  }
}

/**
 * Get tweet by ID
 */
export async function taioGetTweetById(tweetId: string): Promise<ITweet | null> {
  try {
    const raw = await taioGet<any>('/twitter/tweet/info', { tweetId });
    return normalizeTweet(raw);
  } catch (error) {
    console.error('[TwitterAPI.io] taioGetTweetById failed', error);
    return null;
  }
}

/**
 * Get tweet retweeters
 */
export async function taioGetTweetRetweeters(
  tweetId: string,
  cursor?: string
): Promise<{ users: IUserInfo[]; nextCursor: string | null }> {
  try {
    const params: Record<string, string> = { tweetId };
    if (cursor) params.cursor = cursor;
    
    const raw = await taioGet<any>('/twitter/tweet/retweeters', params);
    const users = (raw.users ?? raw ?? []).map((u: any) => normalizeUser(u));
    
    return {
      users,
      nextCursor: raw.next_cursor ?? null,
    };
  } catch (error) {
    console.error('[TwitterAPI.io] taioGetTweetRetweeters failed', error);
    return { users: [], nextCursor: null };
  }
}

/**
 * Get tweet replies
 */
export async function taioGetTweetReplies(
  tweetId: string,
  cursor?: string
): Promise<{ tweets: ITweet[]; nextCursor: string | null }> {
  try {
    const params: Record<string, string> = { tweetId };
    if (cursor) params.cursor = cursor;
    
    const raw = await taioGet<any>('/twitter/tweet/replies', params);
    const tweets = (raw.tweets ?? raw ?? []).map((t: any) => normalizeTweet(t));
    
    return {
      tweets,
      nextCursor: raw.next_cursor ?? null,
    };
  } catch (error) {
    console.error('[TwitterAPI.io] taioGetTweetReplies failed', error);
    return { tweets: [], nextCursor: null };
  }
}
