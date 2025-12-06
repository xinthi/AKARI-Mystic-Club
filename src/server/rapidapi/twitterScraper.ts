/**
 * Twitter Data Scraper API Helper Module
 * 
 * RapidAPI Host: twitter-data-scraper3.p.rapidapi.com
 * 
 * Provides comprehensive Twitter data scraping functions including:
 * - User profiles and timelines
 * - Followers and following
 * - Tweet details, threads, and replies
 * - Search and trends
 * - Lists and communities
 * - Spaces
 * 
 * ⚠️ SERVER-SIDE ONLY - Never import this in frontend code!
 */

import axios from 'axios';

// =============================================================================
// CONFIGURATION
// =============================================================================

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const TWITTER_SCRAPER_HOST = 'twitter-data-scraper3.p.rapidapi.com';
const TWITTER_SCRAPER_BASE_URL = `https://${TWITTER_SCRAPER_HOST}`;

if (!RAPIDAPI_KEY) {
  throw new Error('RAPIDAPI_KEY is not set – required for twitter-data-scraper3');
}

// =============================================================================
// RESPONSE TYPES (raw/unknown for flexibility)
// =============================================================================

export type TwitterScraperUserInfo = unknown;
export type TwitterScraperTimeline = unknown;
export type TwitterScraperFollowers = unknown;
export type TwitterScraperFollowing = unknown;
export type TwitterScraperTweetInfo = unknown;
export type TwitterScraperTrends = unknown;
export type TwitterScraperSearchResults = unknown;
export type TwitterScraperMediaTimeline = unknown;
export type TwitterScraperRetweets = unknown;
export type TwitterScraperReplies = unknown;
export type TwitterScraperTweetThread = unknown;
export type TwitterScraperLatestReplies = unknown;
export type TwitterScraperCheckRetweet = unknown;
export type TwitterScraperCheckFollow = unknown;
export type TwitterScraperListTimeline = unknown;
export type TwitterScraperListFollowers = unknown;
export type TwitterScraperListMembers = unknown;
export type TwitterScraperCommunityPosts = unknown;
export type TwitterScraperCommunitySearchResults = unknown;
export type TwitterScraperSpacesInfo = unknown;
export type TwitterScraperProfilesByResult = unknown;
export type TwitterScraperAffiliates = unknown;

// =============================================================================
// INTERNAL HTTP HELPER
// =============================================================================

/**
 * Make a GET request to twitter-data-scraper3 endpoints.
 */
async function twitterScraperGet<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> {
  try {
    const res = await axios.get<T>(`${TWITTER_SCRAPER_BASE_URL}${path}`, {
      params,
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': TWITTER_SCRAPER_HOST,
      },
      timeout: 30000,
    });
    return res.data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: unknown }; message?: string };
    console.error(
      `[twitter-data-scraper3] GET ${path} failed`,
      axiosError.response?.data ?? axiosError.message
    );
    throw new Error(`twitter-data-scraper3 request failed for ${path}`);
  }
}

// =============================================================================
// USER FUNCTIONS
// =============================================================================

/**
 * Fetch user info by screen name.
 * Endpoint: /screenname.php
 * 
 * @param screenname - Twitter username (without @)
 * @param restId - Optional Twitter user ID
 */
export async function scraperFetchUserInfo(
  screenname: string,
  restId?: string
): Promise<TwitterScraperUserInfo> {
  return twitterScraperGet<TwitterScraperUserInfo>('/screenname.php', {
    screenname,
    rest_id: restId,
  });
}

/**
 * Fetch user timeline (recent tweets).
 * Endpoint: /timeline.php
 * 
 * @param screenname - Twitter username (without @)
 */
export async function scraperFetchUserTimeline(
  screenname: string
): Promise<TwitterScraperTimeline> {
  return twitterScraperGet<TwitterScraperTimeline>('/timeline.php', { screenname });
}

/**
 * Fetch accounts a user is following.
 * Endpoint: /following.php
 * 
 * @param screenname - Twitter username (without @)
 */
export async function scraperFetchFollowing(
  screenname: string
): Promise<TwitterScraperFollowing> {
  return twitterScraperGet<TwitterScraperFollowing>('/following.php', { screenname });
}

/**
 * Fetch user's followers.
 * Endpoint: /followers.php
 * 
 * @param screenname - Twitter username (without @)
 * @param blueVerified - Filter for blue verified accounts (0 or 1)
 */
export async function scraperFetchFollowers(
  screenname: string,
  blueVerified: number = 0
): Promise<TwitterScraperFollowers> {
  return twitterScraperGet<TwitterScraperFollowers>('/followers.php', {
    screenname,
    blue_verified: blueVerified,
  });
}

/**
 * Fetch user's affiliates.
 * Endpoint: /affilates.php
 * 
 * @param screenname - Twitter username (without @)
 */
export async function scraperFetchAffiliates(
  screenname: string
): Promise<TwitterScraperAffiliates> {
  return twitterScraperGet<TwitterScraperAffiliates>('/affilates.php', { screenname });
}

/**
 * Fetch user's media timeline.
 * Endpoint: /usermedia.php
 * 
 * @param screenname - Twitter username (without @)
 */
export async function scraperFetchUserMedia(
  screenname: string
): Promise<TwitterScraperMediaTimeline> {
  return twitterScraperGet<TwitterScraperMediaTimeline>('/usermedia.php', { screenname });
}

/**
 * Fetch user's replies.
 * Endpoint: /replies.php
 * 
 * @param screenname - Twitter username (without @)
 */
export async function scraperFetchReplies(
  screenname: string
): Promise<TwitterScraperReplies> {
  return twitterScraperGet<TwitterScraperReplies>('/replies.php', { screenname });
}

/**
 * Fetch multiple user profiles by their REST IDs.
 * Endpoint: /screennames.php
 * 
 * @param restIdsCsv - Comma-separated REST IDs (URL-encoded)
 */
export async function scraperFetchProfilesByRestIds(
  restIdsCsv: string
): Promise<TwitterScraperProfilesByResult> {
  return twitterScraperGet<TwitterScraperProfilesByResult>('/screennames.php', {
    rest_ids: restIdsCsv,
  });
}

// =============================================================================
// TWEET FUNCTIONS
// =============================================================================

/**
 * Fetch tweet info by ID.
 * Endpoint: /tweet.php
 * 
 * @param tweetId - Tweet ID
 */
export async function scraperFetchTweetInfo(
  tweetId: string
): Promise<TwitterScraperTweetInfo> {
  return twitterScraperGet<TwitterScraperTweetInfo>('/tweet.php', { id: tweetId });
}

/**
 * Fetch retweets for a tweet.
 * Endpoint: /retweets.php
 * 
 * @param tweetId - Tweet ID
 */
export async function scraperFetchRetweets(
  tweetId: string
): Promise<TwitterScraperRetweets> {
  return twitterScraperGet<TwitterScraperRetweets>('/retweets.php', { id: tweetId });
}

/**
 * Fetch tweet thread (full conversation).
 * Endpoint: /tweet_thread.php
 * 
 * @param tweetId - Tweet ID
 */
export async function scraperFetchTweetThread(
  tweetId: string
): Promise<TwitterScraperTweetThread> {
  return twitterScraperGet<TwitterScraperTweetThread>('/tweet_thread.php', { id: tweetId });
}

/**
 * Fetch latest replies to a tweet.
 * Endpoint: /latest_replies.php
 * 
 * @param tweetId - Tweet ID
 */
export async function scraperFetchLatestReplies(
  tweetId: string
): Promise<TwitterScraperLatestReplies> {
  return twitterScraperGet<TwitterScraperLatestReplies>('/latest_replies.php', { id: tweetId });
}

/**
 * Check if a user retweeted a specific tweet.
 * Endpoint: /checkretweet.php
 * 
 * @param screenname - Twitter username to check
 * @param tweetId - Tweet ID to check
 */
export async function scraperCheckRetweet(
  screenname: string,
  tweetId: string
): Promise<TwitterScraperCheckRetweet> {
  return twitterScraperGet<TwitterScraperCheckRetweet>('/checkretweet.php', {
    screenname,
    tweet_id: tweetId,
  });
}

// =============================================================================
// SEARCH & TRENDS
// =============================================================================

/**
 * Search tweets.
 * Endpoint: /search.php
 * 
 * @param query - Search query
 * @param searchType - Search type: 'Top', 'Latest', 'People', 'Photos', 'Videos'
 */
export async function scraperSearch(
  query: string,
  searchType: string = 'Top'
): Promise<TwitterScraperSearchResults> {
  return twitterScraperGet<TwitterScraperSearchResults>('/search.php', {
    query,
    search_type: searchType,
  });
}

/**
 * Fetch trending topics by country.
 * Endpoint: /trends.php
 * 
 * @param country - Country name (e.g., 'UnitedStates', 'UnitedKingdom')
 */
export async function scraperFetchTrends(
  country: string
): Promise<TwitterScraperTrends> {
  return twitterScraperGet<TwitterScraperTrends>('/trends.php', { country });
}

// =============================================================================
// RELATIONSHIP CHECKS
// =============================================================================

/**
 * Check if one user follows another.
 * Endpoint: /checkfollow.php
 * 
 * @param user - Username to check (does this user...)
 * @param follows - Username to check (...follow this user?)
 */
export async function scraperCheckFollow(
  user: string,
  follows: string
): Promise<TwitterScraperCheckFollow> {
  return twitterScraperGet<TwitterScraperCheckFollow>('/checkfollow.php', {
    user,
    follows,
  });
}

// =============================================================================
// LIST FUNCTIONS
// =============================================================================

/**
 * Fetch timeline of a Twitter list.
 * Endpoint: /listtimeline.php
 * 
 * @param listId - List ID
 */
export async function scraperFetchListTimeline(
  listId: string
): Promise<TwitterScraperListTimeline> {
  return twitterScraperGet<TwitterScraperListTimeline>('/listtimeline.php', { list_id: listId });
}

/**
 * Fetch followers of a Twitter list.
 * Endpoint: /list_followers.php
 * 
 * @param listId - List ID
 */
export async function scraperFetchListFollowers(
  listId: string
): Promise<TwitterScraperListFollowers> {
  return twitterScraperGet<TwitterScraperListFollowers>('/list_followers.php', { list_id: listId });
}

/**
 * Fetch members of a Twitter list.
 * Endpoint: /list_members.php
 * 
 * @param listId - List ID
 */
export async function scraperFetchListMembers(
  listId: string
): Promise<TwitterScraperListMembers> {
  return twitterScraperGet<TwitterScraperListMembers>('/list_members.php', { list_id: listId });
}

// =============================================================================
// COMMUNITY FUNCTIONS
// =============================================================================

/**
 * Fetch posts from a Twitter community.
 * Endpoint: /community_timeline.php
 * 
 * @param communityId - Community ID
 * @param ranking - Ranking type: 'Top', 'Latest'
 */
export async function scraperFetchCommunityPosts(
  communityId: string,
  ranking: string = 'Top'
): Promise<TwitterScraperCommunityPosts> {
  return twitterScraperGet<TwitterScraperCommunityPosts>('/community_timeline.php', {
    community_id: communityId,
    ranking,
  });
}

/**
 * Search for communities.
 * Endpoint: /search_communities.php
 * 
 * @param query - Search query
 */
export async function scraperSearchCommunities(
  query: string
): Promise<TwitterScraperCommunitySearchResults> {
  return twitterScraperGet<TwitterScraperCommunitySearchResults>('/search_communities.php', { query });
}

/**
 * Search for communities (top results).
 * Endpoint: /search_communities_top.php
 * 
 * @param query - Search query
 */
export async function scraperSearchCommunitiesTop(
  query: string
): Promise<TwitterScraperCommunitySearchResults> {
  return twitterScraperGet<TwitterScraperCommunitySearchResults>('/search_communities_top.php', { query });
}

/**
 * Search for communities (latest results).
 * Endpoint: /search_communities_latest.php
 * 
 * @param query - Search query
 */
export async function scraperSearchCommunitiesLatest(
  query: string
): Promise<TwitterScraperCommunitySearchResults> {
  return twitterScraperGet<TwitterScraperCommunitySearchResults>('/search_communities_latest.php', { query });
}

// =============================================================================
// SPACES FUNCTIONS
// =============================================================================

/**
 * Fetch Twitter Spaces info.
 * Endpoint: /spaces.php
 * 
 * @param spaceId - Space ID
 */
export async function scraperFetchSpacesInfo(
  spaceId: string
): Promise<TwitterScraperSpacesInfo> {
  return twitterScraperGet<TwitterScraperSpacesInfo>('/spaces.php', { id: spaceId });
}

