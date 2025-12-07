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
  // TwitterAPI.io uses camelCase (followersCount) while some APIs use snake_case (followers_count)
  const followers = Number(
    raw.followersCount ?? raw.followers_count ?? raw.followers ?? 0
  );
  const following = Number(
    raw.followingCount ?? raw.friends_count ?? raw.following ?? 0
  );
  const tweetCount = Number(
    raw.tweetCount ?? raw.statusesCount ?? raw.statuses_count ?? raw.tweet_count ?? 0
  );
  
  return {
    id: String(raw.id ?? raw.user_id ?? ''),
    username: raw.userName ?? raw.screen_name ?? raw.username ?? '',
    name: raw.name ?? '',
    profileImageUrl: (raw.profileImageUrl ?? raw.profile_image_url_https ?? raw.profile_image_url ?? '')
      .replace('_normal', '_400x400'),
    description: raw.description ?? '',
    followers,
    following,
    tweetCount,
    isBlueVerified: Boolean(raw.isBlueVerified ?? raw.is_blue_verified ?? raw.verified ?? false),
    verifiedType: raw.verifiedType ?? raw.verified_type ?? null,
    createdAt: raw.createdAt ?? raw.created_at ?? '',
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
 * 
 * Uses direct fetch instead of taioGet because the followers endpoint
 * returns data directly (not wrapped in { status, data }).
 * 
 * API docs: https://docs.twitterapi.io/api-reference/endpoint/get_user_followers
 */
export async function taioGetUserFollowers(
  userName: string,
  pageSize: number = 200,
  cursor?: string
): Promise<{ users: IUserInfo[]; hasNextPage: boolean; nextCursor: string | null }> {
  if (!TAIO_API_KEY) {
    console.error('[TwitterAPI.io] Missing TWITTERAPIIO_API_KEY');
    return { users: [], hasNextPage: false, nextCursor: null };
  }

  try {
    const url = new URL(`${TAIO_BASE_URL}/twitter/user/followers`);
    url.searchParams.set('userName', userName);
    url.searchParams.set('pageSize', String(pageSize));
    if (cursor) url.searchParams.set('cursor', cursor);

    console.log(`[TwitterAPI.io] Fetching followers for @${userName} (pageSize=${pageSize})`);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-API-Key': TAIO_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[TwitterAPI.io] followers HTTP ${res.status}:`, errorText);
      return { users: [], hasNextPage: false, nextCursor: null };
    }

    const raw = await res.json();
    
    // Log raw response structure for debugging
    console.log(`[TwitterAPI.io] followers response keys:`, Object.keys(raw || {}));

    // Defensive parsing - support followers, users, data, or raw array
    let rawUsers: any[] = [];
    if (raw?.followers && Array.isArray(raw.followers)) {
      rawUsers = raw.followers;
    } else if (raw?.users && Array.isArray(raw.users)) {
      rawUsers = raw.users;
    } else if (raw?.data && Array.isArray(raw.data)) {
      rawUsers = raw.data;
    } else if (Array.isArray(raw)) {
      rawUsers = raw;
    } else {
      console.error('[TwitterAPI.io] followers unexpected response shape:', JSON.stringify(raw).slice(0, 500));
      return { users: [], hasNextPage: false, nextCursor: null };
    }

    // Normalize each follower to IUserInfo
    const users = rawUsers.map((u: any) => normalizeFollowerToUser(u));

    const hasNextPage = Boolean(raw?.has_next_page ?? raw?.hasNextPage ?? false);
    const nextCursor = raw?.next_cursor ?? raw?.nextCursor ?? null;

    console.log(`[TwitterAPI.io] followers for @${userName}: ${users.length} users, hasNextPage=${hasNextPage}`);

    return { users, hasNextPage, nextCursor };
  } catch (error: any) {
    console.error('[TwitterAPI.io] taioGetUserFollowers exception:', error?.message || error);
    return { users: [], hasNextPage: false, nextCursor: null };
  }
}

/**
 * Normalize follower data from TwitterAPI.io to IUserInfo
 * Handles both camelCase and snake_case field names
 */
function normalizeFollowerToUser(u: any): IUserInfo {
  return {
    id: String(u.id ?? u.user_id ?? u.userId ?? ''),
    username: u.userName ?? u.username ?? u.screen_name ?? '',
    name: u.name ?? '',
    profileImageUrl: (u.profileImageUrl ?? u.profile_image_url ?? u.profile_image_url_https ?? '')
      .replace('_normal', '_400x400'),
    description: u.description ?? u.bio ?? '',
    followers: Number(u.followersCount ?? u.followers_count ?? u.followers ?? 0),
    following: Number(u.followingCount ?? u.following_count ?? u.friends_count ?? 0),
    tweetCount: Number(u.tweetCount ?? u.statuses_count ?? u.tweet_count ?? 0),
    isBlueVerified: Boolean(u.isBlueVerified ?? u.is_blue_verified ?? u.verified ?? false),
    verifiedType: u.verifiedType ?? u.verified_type ?? null,
    createdAt: u.createdAt ?? u.created_at ?? '',
  };
}

/**
 * Get user's verified followers
 * 
 * Uses direct fetch instead of taioGet because the endpoint
 * returns data directly (not wrapped in { status, data }).
 */
export async function taioGetUserVerifiedFollowers(
  userName: string,
  pageSize: number = 100,
  cursor?: string
): Promise<{ users: IUserInfo[]; hasNextPage: boolean; nextCursor: string | null }> {
  if (!TAIO_API_KEY) {
    console.error('[TwitterAPI.io] Missing TWITTERAPIIO_API_KEY');
    return { users: [], hasNextPage: false, nextCursor: null };
  }

  try {
    const url = new URL(`${TAIO_BASE_URL}/twitter/user/verified_followers`);
    url.searchParams.set('userName', userName);
    url.searchParams.set('pageSize', String(pageSize));
    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-API-Key': TAIO_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[TwitterAPI.io] verified_followers HTTP ${res.status}:`, errorText);
      return { users: [], hasNextPage: false, nextCursor: null };
    }

    const raw = await res.json();

    // Defensive parsing
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

    const users = rawUsers.map((u: any) => normalizeFollowerToUser(u));
    const hasNextPage = Boolean(raw?.has_next_page ?? raw?.hasNextPage ?? false);
    const nextCursor = raw?.next_cursor ?? raw?.nextCursor ?? null;

    return { users, hasNextPage, nextCursor };
  } catch (error: any) {
    console.error('[TwitterAPI.io] taioGetUserVerifiedFollowers exception:', error?.message || error);
    return { users: [], hasNextPage: false, nextCursor: null };
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
 * Get tweets that mention a given user (screen name)
 * Uses the /twitter/user/mentions endpoint
 * 
 * API docs: https://docs.twitterapi.io/api-reference/endpoint/get_user_mentions
 */
export interface IMention {
  id: string;
  text: string;
  url: string;
  createdAt: string;
  likeCount: number;
  replyCount: number;
  retweetCount: number;
  quoteCount: number;
  viewCount: number;
  authorUsername: string | undefined;
}

export async function taioGetUserMentions(
  username: string,
  limit: number = 50
): Promise<IMention[]> {
  if (!TAIO_API_KEY) {
    console.error('[TwitterAPI.io] Missing TWITTERAPIIO_API_KEY - cannot fetch mentions');
    throw new Error('TwitterAPI.io API key not configured');
  }

  const all: IMention[] = [];
  let cursor: string | undefined;

  console.log(`[TwitterAPI.io] Fetching mentions for @${username} (limit=${limit})`);

  while (all.length < limit) {
    const params = new URLSearchParams({ userName: username });
    if (cursor) params.set('cursor', cursor);

    const url = `${TAIO_BASE_URL}/twitter/user/mentions?${params.toString()}`;

    try {
      const res = await fetch(url, {
        headers: {
          'X-API-Key': TAIO_API_KEY,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('[TwitterAPI.io] mentions error', res.status, text);
        throw new Error(`twitterapi.io mentions failed with status ${res.status}`);
      }

      const data = await res.json() as any;

      const pageTweets: IMention[] = (data.tweets ?? []).map((t: any) => ({
        id: String(t.id ?? ''),
        text: t.text ?? t.full_text ?? '',
        url: t.url ?? `https://x.com/${t.author?.userName ?? t.author?.screenName ?? 'i'}/status/${t.id}`,
        createdAt: t.createdAt ?? t.created_at ?? '',
        likeCount: Number(t.likeCount ?? t.favoriteCount ?? t.favorite_count ?? 0),
        replyCount: Number(t.replyCount ?? t.reply_count ?? 0),
        retweetCount: Number(t.retweetCount ?? t.retweet_count ?? 0),
        quoteCount: Number(t.quoteCount ?? t.quote_count ?? 0),
        viewCount: Number(t.viewCount ?? t.view_count ?? 0),
        authorUsername: t.author?.userName ?? t.author?.screenName ?? t.author?.username ?? undefined,
      }));

      all.push(...pageTweets);

      // Check for next page
      const hasNext =
        data.has_next_page === true ||
        data.hasNext === true ||
        data.hasNextPage === true;

      cursor = data.next_cursor ?? data.nextCursor ?? undefined;

      if (!hasNext || !cursor) break;
    } catch (error) {
      console.error('[TwitterAPI.io] taioGetUserMentions fetch error', error);
      break;
    }
  }

  console.log(`[TwitterAPI.io] mentions for @${username}: ${all.length} tweets`);
  return all.slice(0, limit);
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
