/**
 * RapidAPI Twitter Helper Module
 * 
 * Centralizes all Twitter-related API calls using three RapidAPI services:
 * - Twitter Data Scraper: User profile data (screenname.php)
 * - Twitter Api (twitter-api65): Full API with user details, tweets, followers, search
 * - Twitter Scraper: Advanced tweet scraping
 * 
 * ⚠️ SERVER-SIDE ONLY - Never import this in frontend code!
 */

import axios from 'axios';

// =============================================================================
// CONFIGURATION
// =============================================================================

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const TWITTER_API_AUTH = process.env.TWITTER_API65_AUTH_TOKEN;

// Validate required env vars at module load
if (!RAPIDAPI_KEY) {
  throw new Error('RAPIDAPI_KEY environment variable is not set');
}

if (!TWITTER_API_AUTH) {
  console.warn('[twitter-api65] TWITTER_API65_AUTH_TOKEN is not set – requests will likely fail');
}

// API Hosts
const TWITTER_DATA_HOST = 'twitter-data-scraper3.p.rapidapi.com';
const TWITTER_API_HOST = 'twitter-api65.p.rapidapi.com';
const TWITTER_SCRAPER_HOST = 'twitter-scraper2.p.rapidapi.com';

// Base URLs
const TWITTER_DATA_BASE = `https://${TWITTER_DATA_HOST}`;
const TWITTER_API_BASE = `https://${TWITTER_API_HOST}`;
const TWITTER_SCRAPER_BASE = `https://${TWITTER_SCRAPER_HOST}`;

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
 * Normalized tweet data
 */
export interface TwitterTweet {
  id: string;
  text: string;
  authorHandle: string;
  createdAt: string;
  likeCount?: number;
  replyCount?: number;
  retweetCount?: number;
}

/**
 * Extended tweet detail with additional metrics
 */
export interface TwitterTweetDetail extends TwitterTweet {
  quoteCount?: number;
  bookmarkCount?: number;
  impressionCount?: number;
  authorName?: string;
  authorAvatarUrl?: string;
}

/**
 * Parameters for tweet scraping
 */
export interface ScrapeTweetsParams {
  /** Search terms (e.g. "$AKARI" or "akari mystic") */
  searchTerms: string;
  /** Maximum tweets to return, default 50 */
  maxTweets?: number;
  /** Optional advanced URL, otherwise builds a simple search URL */
  url?: string;
}

/**
 * Options for tweet search
 */
export interface TwitterSearchOptions {
  /** Search query string */
  query: string;
  /** Search type: 'Latest', 'Top', 'People', 'Photos', 'Videos', 'lists' */
  type?: string;
  /** Maximum results to return (client-side trim) */
  limit?: number;
}

// =============================================================================
// RAW RESPONSE TYPES (for internal use)
// =============================================================================

interface RawTwitterApiUser {
  id?: string;
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

interface RawTwitterApiTweet {
  id?: string;
  id_str?: string;
  rest_id?: string;
  text?: string;
  full_text?: string;
  content?: string;
  user?: RawTwitterApiUser;
  author?: RawTwitterApiUser;
  core?: {
    user_results?: {
      result?: RawTwitterApiUser;
    };
  };
  screen_name?: string;
  username?: string;
  created_at?: string;
  date?: string;
  timestamp?: string;
  favorite_count?: number;
  like_count?: number;
  likes?: number;
  reply_count?: number;
  replies?: number;
  retweet_count?: number;
  retweets?: number;
  quote_count?: number;
  bookmark_count?: number;
  view_count?: number;
  views?: number;
  impression_count?: number;
  legacy?: {
    full_text?: string;
    favorite_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    created_at?: string;
    user_id_str?: string;
  };
}

interface RawDataScraperUser {
  screen_name?: string;
  screenname?: string;
  username?: string;
  name?: string;
  full_name?: string;
  description?: string;
  bio?: string;
  profile_image_url_https?: string;
  profile_image_url?: string;
  avatar?: string;
  followers_count?: number;
  followers?: number;
  friends_count?: number;
  following?: number;
  statuses_count?: number;
  tweet_count?: number;
  tweets_count?: number;
  created_at?: string;
}

interface RawScraperTweet {
  id?: string;
  tweetId?: string;
  tweet_id?: string;
  text?: string;
  content?: string;
  full_text?: string;
  user?: string;
  username?: string;
  author?: string;
  screen_name?: string;
  date?: string;
  created_at?: string;
  timestamp?: string;
  likes?: number;
  like_count?: number;
  favorite_count?: number;
  replies?: number;
  reply_count?: number;
  retweets?: number;
  retweet_count?: number;
}

// =============================================================================
// INTERNAL API HELPER
// =============================================================================

/**
 * Make a POST request to twitter-api65 endpoints.
 * Includes all required headers (Authorization, RapidAPI).
 */
async function twitterApiPost<T>(path: string, body: unknown): Promise<T> {
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

// =============================================================================
// NORMALIZATION HELPERS
// =============================================================================

/**
 * Normalize user from twitter-api65 response
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

/**
 * Normalize tweet from twitter-api65 response
 */
function normalizeTweetFromApi(raw: unknown): TwitterTweet | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as RawTwitterApiTweet;
  const legacy = data.legacy;

  // Extract ID - required
  const id = data.id?.toString() || data.id_str || data.rest_id;
  if (!id) {
    return null;
  }

  // Extract text - required
  const text = data.text || data.full_text || data.content || legacy?.full_text;
  if (!text) {
    return null;
  }

  // Extract author handle
  const user = data.user || data.author || data.core?.user_results?.result;
  const authorHandle = 
    user?.screen_name ||
    user?.username ||
    user?.legacy?.screen_name ||
    data.screen_name ||
    data.username ||
    'unknown';

  // Normalize created_at
  let createdAt = data.created_at || data.date || data.timestamp || legacy?.created_at || '';
  if (createdAt) {
    try {
      createdAt = new Date(createdAt).toISOString();
    } catch {
      // Keep original
    }
  }

  return {
    id: String(id),
    text: String(text),
    authorHandle: String(authorHandle),
    createdAt,
    likeCount: data.favorite_count ?? data.like_count ?? data.likes ?? legacy?.favorite_count,
    replyCount: data.reply_count ?? data.replies ?? legacy?.reply_count,
    retweetCount: data.retweet_count ?? data.retweets ?? legacy?.retweet_count,
  };
}

/**
 * Normalize tweet data from twitter-data-scraper3 timeline endpoint.
 * This API has a different structure than twitter-api65.
 */
function normalizeTweetFromDataScraper(raw: unknown): TwitterTweet | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as Record<string, unknown>;
  
  // Navigate nested structure if needed
  const tweet = (data.tweet as Record<string, unknown>) || 
                (data.content as Record<string, unknown>) || 
                data;
  const legacy = (tweet.legacy as Record<string, unknown>) || tweet;

  // Extract ID - required
  const id = tweet.id || tweet.id_str || tweet.rest_id || data.id || data.id_str;
  if (!id) {
    return null;
  }

  // Extract text - required
  const text = legacy.full_text || legacy.text || tweet.text || tweet.full_text || data.text;
  if (!text) {
    return null;
  }

  // Extract author handle from nested user or core structure
  const user = (tweet.user as Record<string, unknown>) || 
               (tweet.core as Record<string, unknown>)?.user_results || 
               (data.user as Record<string, unknown>);
  const userResult = (user?.result as Record<string, unknown>) || user;
  const userLegacy = (userResult?.legacy as Record<string, unknown>) || userResult;
  
  const authorHandle = 
    userLegacy?.screen_name ||
    userResult?.screen_name ||
    user?.screen_name ||
    tweet.screen_name ||
    data.screen_name ||
    'unknown';

  // Normalize created_at
  let createdAt = legacy.created_at || tweet.created_at || data.created_at || '';
  if (createdAt) {
    try {
      createdAt = new Date(String(createdAt)).toISOString();
    } catch {
      // Keep original
    }
  }

  return {
    id: String(id),
    text: String(text),
    authorHandle: String(authorHandle),
    createdAt: String(createdAt),
    likeCount: Number(legacy.favorite_count ?? legacy.like_count ?? tweet.favorite_count ?? 0),
    replyCount: Number(legacy.reply_count ?? tweet.reply_count ?? 0),
    retweetCount: Number(legacy.retweet_count ?? tweet.retweet_count ?? 0),
  };
}

/**
 * Normalize tweet detail with extended metrics
 */
function normalizeTweetDetailFromApi(raw: unknown): TwitterTweetDetail | null {
  const baseTweet = normalizeTweetFromApi(raw);
  if (!baseTweet) {
    return null;
  }

  const data = raw as RawTwitterApiTweet;
  const legacy = data.legacy;
  const user = data.user || data.author || data.core?.user_results?.result;

  return {
    ...baseTweet,
    quoteCount: data.quote_count ?? legacy?.quote_count,
    bookmarkCount: data.bookmark_count ?? legacy?.bookmark_count,
    impressionCount: data.impression_count ?? data.view_count ?? data.views,
    authorName: user?.name || user?.legacy?.name,
    authorAvatarUrl: user?.profile_image_url_https || user?.legacy?.profile_image_url_https,
  };
}

/**
 * Normalize user profile from Twitter Data Scraper response
 */
function normalizeUserProfileFromDataScraper(raw: unknown): TwitterUserProfile | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as RawDataScraperUser;

  // Extract handle - required field
  const handle = data.screen_name || data.screenname || data.username;
  if (!handle) {
    return null;
  }

  return {
    handle: String(handle),
    name: data.name || data.full_name,
    bio: data.description || data.bio,
    avatarUrl: data.profile_image_url_https || data.profile_image_url || data.avatar,
    followersCount: data.followers_count ?? data.followers,
    followingCount: data.friends_count ?? data.following,
    tweetCount: data.statuses_count ?? data.tweet_count ?? data.tweets_count,
    createdAt: data.created_at,
  };
}

/**
 * Normalize tweet from Twitter Scraper response
 */
function normalizeTweetFromScraper(raw: unknown): TwitterTweet | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as RawScraperTweet;

  // Extract ID - required
  const id = data.id?.toString() || data.tweetId || data.tweet_id;
  if (!id) {
    return null;
  }

  // Extract text - required
  const text = data.text || data.content || data.full_text;
  if (!text) {
    return null;
  }

  // Extract author handle
  const authorHandle = 
    data.user ||
    data.username ||
    data.author ||
    data.screen_name ||
    'unknown';

  // Extract created date
  const createdAt = data.date || data.created_at || data.timestamp || '';

  return {
    id: String(id),
    text: String(text),
    authorHandle: String(authorHandle),
    createdAt,
    likeCount: data.likes ?? data.like_count ?? data.favorite_count,
    replyCount: data.replies ?? data.reply_count,
    retweetCount: data.retweets ?? data.retweet_count,
  };
}

/**
 * Extract array from API response (handles various wrapper structures)
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

// =============================================================================
// TWITTER-API65 FUNCTIONS
// =============================================================================

/**
 * Fetch user details by screen name.
 * Uses twitter-api65 /user-details-by-screen-name endpoint.
 * 
 * @param username - Twitter username/handle (without @)
 * @returns User profile or null if not found
 */
export async function fetchUserDetailsByScreenName(
  username: string
): Promise<TwitterUserProfile | null> {
  const cleanUsername = username.replace('@', '');

  try {
    const response = await twitterApiPost<unknown>('/user-details-by-screen-name', {
      username: cleanUsername,
    });

    // Handle different response structures
    let userData: unknown = response;
    if (response && typeof response === 'object') {
      const record = response as Record<string, unknown>;
      userData = record.user || record.data || record.result || response;
    }

    return normalizeUserFromApi(userData);
  } catch (error) {
    // Return null for not-found cases
    return null;
  }
}

/**
 * Fetch tweets by user ID.
 * Uses twitter-api65 /user-tweets endpoint.
 * 
 * @param userId - Twitter user ID string
 * @param limit - Maximum tweets to return
 * @returns Array of tweets
 */
export async function fetchUserTweetsById(
  userId: string,
  limit: number = 20
): Promise<TwitterTweet[]> {
  const response = await twitterApiPost<unknown>('/user-tweets', {
    userId: String(userId),
  });

  const rawTweets = extractArrayFromResponse(response, 'tweets', 'results', 'data', 'statuses');
  
  const tweets: TwitterTweet[] = [];
  for (const rawTweet of rawTweets) {
    const normalized = normalizeTweetFromApi(rawTweet);
    if (normalized) {
      tweets.push(normalized);
    }
  }

  return tweets.slice(0, limit);
}

/**
 * Fetch followers by user ID.
 * Uses twitter-api65 /followers endpoint.
 * 
 * @param userId - Twitter user ID string
 * @param limit - Maximum followers to return
 * @returns Array of user profiles
 */
export async function fetchFollowersByUserId(
  userId: string,
  limit: number = 50
): Promise<TwitterUserProfile[]> {
  const response = await twitterApiPost<unknown>('/followers', {
    userId: String(userId),
  });

  const rawUsers = extractArrayFromResponse(response, 'followers', 'users', 'data', 'results');
  
  const users: TwitterUserProfile[] = [];
  for (const rawUser of rawUsers) {
    const normalized = normalizeUserFromApi(rawUser);
    if (normalized) {
      users.push(normalized);
    }
  }

  return users.slice(0, limit);
}

/**
 * Fetch verified followers by user ID.
 * Uses twitter-api65 /verified-followers endpoint.
 * 
 * @param userId - Twitter user ID string
 * @param limit - Maximum followers to return
 * @returns Array of verified user profiles
 */
export async function fetchVerifiedFollowersByUserId(
  userId: string,
  limit: number = 50
): Promise<TwitterUserProfile[]> {
  const response = await twitterApiPost<unknown>('/verified-followers', {
    userId: String(userId),
  });

  const rawUsers = extractArrayFromResponse(response, 'followers', 'users', 'data', 'results');
  
  const users: TwitterUserProfile[] = [];
  for (const rawUser of rawUsers) {
    const normalized = normalizeUserFromApi(rawUser);
    if (normalized) {
      users.push(normalized);
    }
  }

  return users.slice(0, limit);
}

/**
 * Fetch accounts a user is following by user ID.
 * Uses twitter-api65 /following endpoint.
 * 
 * @param userId - Twitter user ID string
 * @param limit - Maximum accounts to return
 * @returns Array of user profiles
 */
export async function fetchFollowingByUserId(
  userId: string,
  limit: number = 50
): Promise<TwitterUserProfile[]> {
  const response = await twitterApiPost<unknown>('/following', {
    userId: String(userId),
  });

  const rawUsers = extractArrayFromResponse(response, 'following', 'users', 'data', 'results');
  
  const users: TwitterUserProfile[] = [];
  for (const rawUser of rawUsers) {
    const normalized = normalizeUserFromApi(rawUser);
    if (normalized) {
      users.push(normalized);
    }
  }

  return users.slice(0, limit);
}

/**
 * Fetch media tweets by user ID.
 * Uses twitter-api65 /user-media endpoint.
 * 
 * @param userId - Twitter user ID string
 * @param limit - Maximum tweets to return
 * @returns Array of tweets with media
 */
export async function fetchUserMediaByUserId(
  userId: string,
  limit: number = 20
): Promise<TwitterTweet[]> {
  const response = await twitterApiPost<unknown>('/user-media', {
    userId: String(userId),
  });

  const rawTweets = extractArrayFromResponse(response, 'tweets', 'media', 'results', 'data');
  
  const tweets: TwitterTweet[] = [];
  for (const rawTweet of rawTweets) {
    const normalized = normalizeTweetFromApi(rawTweet);
    if (normalized) {
      tweets.push(normalized);
    }
  }

  return tweets.slice(0, limit);
}

/**
 * Fetch highlighted tweets by user ID.
 * Uses twitter-api65 /highlighted-tweets endpoint.
 * 
 * @param userId - Twitter user ID string
 * @param limit - Maximum tweets to return
 * @returns Array of highlighted tweets
 */
export async function fetchHighlightedTweetsByUserId(
  userId: string,
  limit: number = 20
): Promise<TwitterTweet[]> {
  const response = await twitterApiPost<unknown>('/highlighted-tweets', {
    userId: String(userId),
  });

  const rawTweets = extractArrayFromResponse(response, 'tweets', 'highlighted', 'results', 'data');
  
  const tweets: TwitterTweet[] = [];
  for (const rawTweet of rawTweets) {
    const normalized = normalizeTweetFromApi(rawTweet);
    if (normalized) {
      tweets.push(normalized);
    }
  }

  return tweets.slice(0, limit);
}

/**
 * Fetch detailed information about a single tweet.
 * Uses twitter-api65 /tweet-detail endpoint.
 * 
 * @param tweetId - Tweet ID string
 * @returns Tweet detail or null if not found
 */
export async function fetchTweetDetail(
  tweetId: string
): Promise<TwitterTweetDetail | null> {
  try {
    const response = await twitterApiPost<unknown>('/tweet-detail', {
      tweetId: String(tweetId),
    });

    // Handle different response structures
    let tweetData: unknown = response;
    if (response && typeof response === 'object') {
      const record = response as Record<string, unknown>;
      tweetData = record.tweet || record.data || record.result || response;
    }

    return normalizeTweetDetailFromApi(tweetData);
  } catch (error) {
    return null;
  }
}

/**
 * Search tweets using twitter-api65 /search endpoint.
 * 
 * @param opts - Search options
 * @returns Array of tweets
 */
export async function searchTweets(
  opts: TwitterSearchOptions
): Promise<TwitterTweet[]> {
  const { query, type = 'Latest', limit = 50 } = opts;

  const response = await twitterApiPost<unknown>('/search', {
    query,
    type,
  });

  const rawTweets = extractArrayFromResponse(response, 'tweets', 'results', 'data', 'statuses');
  
  const tweets: TwitterTweet[] = [];
  for (const rawTweet of rawTweets) {
    const normalized = normalizeTweetFromApi(rawTweet);
    if (normalized) {
      tweets.push(normalized);
    }
  }

  return tweets.slice(0, limit);
}

/**
 * Search for Twitter users/profiles.
 * Uses twitter-api65 /search endpoint with type="People".
 * 
 * @param query - Search query (username, name, or keywords)
 * @param limit - Maximum users to return
 * @returns Array of user profiles
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

// =============================================================================
// LEGACY FUNCTIONS (using other hosts)
// =============================================================================

/**
 * Fetch a Twitter user's profile by handle.
 * Uses Twitter Data Scraper API (twitter-data-scraper3).
 * 
 * @param handle - Twitter handle (without @)
 * @returns User profile or null if not found
 */
export async function fetchUserProfile(handle: string): Promise<TwitterUserProfile | null> {
  const cleanHandle = handle.replace('@', '');

  try {
    const response = await axios.get(`${TWITTER_DATA_BASE}/screenname.php`, {
      params: {
        screenname: cleanHandle,
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': TWITTER_DATA_HOST,
      },
      timeout: 30000,
    });

    const data = response.data;

    // Handle different response structures
    let profileData: unknown = data;

    // If wrapped in a container object
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      profileData = 
        (data as Record<string, unknown>).user ||
        (data as Record<string, unknown>).data ||
        (data as Record<string, unknown>).result ||
        data;
    }

    return normalizeUserProfileFromDataScraper(profileData);
  } catch (error: unknown) {
    const axiosError = error as { response?: { status?: number; data?: unknown }; message?: string };
    
    // Return null for 404 or not-found cases
    if (axiosError.response?.status === 404) {
      return null;
    }

    console.error(
      '[RapidAPI:twitter] Error fetching user profile:',
      axiosError.response?.data || axiosError.message
    );
    throw new Error('Twitter user profile API request failed');
  }
}

/**
 * Fetch recent tweets from a user by handle.
 * Tries multiple APIs with fallback:
 * 1. twitter-api65 search (primary)
 * 2. twitter-data-scraper3 timeline (fallback)
 * 
 * @param handle - Twitter handle (without @)
 * @param limit - Maximum tweets to return
 * @returns Array of tweets
 */
export async function fetchUserTweets(
  handle: string,
  limit: number = 20
): Promise<TwitterTweet[]> {
  const cleanHandle = handle.replace('@', '');
  
  // Try twitter-api65 search first
  try {
    return await searchTweets({
      query: `from:${cleanHandle}`,
      type: 'Latest',
      limit,
    });
  } catch (primaryError) {
    console.log(`[twitter] Primary API failed for @${cleanHandle}, trying fallback...`);
  }

  // Fallback: Use twitter-data-scraper3 timeline endpoint
  try {
    const response = await axios.get(`${TWITTER_DATA_BASE}/timeline.php`, {
      params: { screenname: cleanHandle },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': TWITTER_DATA_HOST,
      },
      timeout: 30000,
    });

    const data = response.data;
    const tweets: TwitterTweet[] = [];

    // Extract tweets from response (structure may vary)
    const rawTweets = extractArrayFromResponse(data, 'timeline', 'tweets', 'data', 'results');
    
    for (const raw of rawTweets) {
      const normalized = normalizeTweetFromDataScraper(raw);
      if (normalized) {
        tweets.push(normalized);
      }
    }

    console.log(`[twitter] Fallback API returned ${tweets.length} tweets for @${cleanHandle}`);
    return tweets.slice(0, limit);
  } catch (fallbackError: unknown) {
    const err = fallbackError as { response?: { data?: unknown }; message?: string };
    console.error('[twitter] Both APIs failed:', err.response?.data || err.message);
    return []; // Return empty array instead of throwing
  }
}

/**
 * Fetch a sample of accounts that mention/interact with a user.
 * 
 * Tries multiple methods with fallback:
 * 1. Twitter Scraper search (for mentions)
 * 2. Twitter Data Scraper followers endpoint
 * 
 * @param handle - Twitter handle (without @)
 * @param limit - Maximum profiles to return
 * @returns Array of user profiles (partial data from tweet authors)
 */
export async function fetchUserFollowersSample(
  handle: string,
  limit: number = 50
): Promise<TwitterUserProfile[]> {
  const cleanHandle = handle.replace('@', '');

  // Method 1: Try Twitter Scraper to search for mentions
  try {
    const tweets = await scrapeTweetsBySearch({
      searchTerms: `@${cleanHandle}`,
      maxTweets: Math.min(limit * 2, 100),
    });

    // Extract unique authors
    const authorMap = new Map<string, TwitterUserProfile>();

    for (const tweet of tweets) {
      const authorHandle = tweet.authorHandle.toLowerCase();
      
      // Skip the target user and already-seen authors
      if (authorHandle === cleanHandle.toLowerCase() || authorMap.has(authorHandle)) {
        continue;
      }

      authorMap.set(authorHandle, {
        handle: tweet.authorHandle,
      });

      if (authorMap.size >= limit) {
        break;
      }
    }

    if (authorMap.size > 0) {
      return Array.from(authorMap.values());
    }
  } catch (error) {
    console.log(`[twitter] Primary follower method failed for @${cleanHandle}, trying fallback...`);
  }

  // Method 2: Fallback to twitter-data-scraper3 followers endpoint
  try {
    const response = await axios.get(`${TWITTER_DATA_BASE}/followers.php`, {
      params: { 
        screenname: cleanHandle,
        blue_verified: 0,
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': TWITTER_DATA_HOST,
      },
      timeout: 30000,
    });

    const data = response.data;
    const profiles: TwitterUserProfile[] = [];

    // Extract followers from response
    const rawFollowers = extractArrayFromResponse(data, 'followers', 'users', 'data', 'results');
    
    for (const raw of rawFollowers) {
      const normalized = normalizeUserProfileFromDataScraper(raw);
      if (normalized && normalized.handle !== cleanHandle) {
        profiles.push(normalized);
      }
      if (profiles.length >= limit) {
        break;
      }
    }

    console.log(`[twitter] Fallback followers API returned ${profiles.length} profiles for @${cleanHandle}`);
    return profiles;
  } catch (fallbackError: unknown) {
    const err = fallbackError as { response?: { data?: unknown }; message?: string };
    console.error('[twitter] Both follower methods failed:', err.response?.data || err.message);
    return []; // Return empty array instead of throwing
  }
}

/**
 * Scrape tweets by search terms using Twitter Scraper API.
 * Uses twitter-scraper2 host.
 * 
 * @param params - Search parameters
 * @returns Array of tweets
 */
export async function scrapeTweetsBySearch(
  params: ScrapeTweetsParams
): Promise<TwitterTweet[]> {
  const { searchTerms, maxTweets = 50, url } = params;

  // Build search URL if not provided
  const searchUrl = url || `https://x.com/search?q=${encodeURIComponent(searchTerms)}&src=typed_query&f=live`;

  try {
    const response = await axios.get(`${TWITTER_SCRAPER_BASE}/scrape`, {
      params: {
        searchTerms: searchTerms,
        maxTweets: maxTweets,
        url: searchUrl,
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': TWITTER_SCRAPER_HOST,
      },
      timeout: 60000,
    });

    const rawTweets = extractArrayFromResponse(response.data, 'tweets', 'results', 'data');

    const tweets: TwitterTweet[] = [];
    for (const rawTweet of rawTweets) {
      const normalized = normalizeTweetFromScraper(rawTweet);
      if (normalized) {
        tweets.push(normalized);
      }
    }

    return tweets;
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: unknown }; message?: string };
    console.error(
      '[RapidAPI:twitter] Error scraping tweets:',
      axiosError.response?.data || axiosError.message
    );
    throw new Error('Twitter scraper API request failed');
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculate follower quality score from a sample of profiles.
 * 
 * @param profiles - Array of user profiles
 * @returns Quality score 0-100
 */
export function calculateFollowerQuality(profiles: TwitterUserProfile[]): number {
  if (profiles.length === 0) {
    return 50;
  }

  let totalScore = 0;
  let scoredCount = 0;

  for (const profile of profiles) {
    if (profile.followersCount === undefined) {
      continue;
    }

    let score = 0;

    // Follower count factor
    if (profile.followersCount >= 10000) {
      score += 40;
    } else if (profile.followersCount >= 1000) {
      score += 30;
    } else if (profile.followersCount >= 100) {
      score += 20;
    } else {
      score += 10;
    }

    // Follower/following ratio
    if (profile.followingCount && profile.followingCount > 0) {
      const ratio = profile.followersCount / profile.followingCount;
      if (ratio >= 2) {
        score += 30;
      } else if (ratio >= 1) {
        score += 20;
      } else if (ratio >= 0.5) {
        score += 10;
      }
    } else {
      score += 15;
    }

    // Tweet activity
    if (profile.tweetCount !== undefined) {
      if (profile.tweetCount >= 1000) {
        score += 30;
      } else if (profile.tweetCount >= 100) {
        score += 20;
      } else if (profile.tweetCount >= 10) {
        score += 10;
      }
    } else {
      score += 15;
    }

    // Verified bonus
    if (profile.verified) {
      score += 20;
    }

    totalScore += Math.min(100, score);
    scoredCount++;
  }

  if (scoredCount === 0) {
    return 50;
  }

  return Math.round(totalScore / scoredCount);
}
