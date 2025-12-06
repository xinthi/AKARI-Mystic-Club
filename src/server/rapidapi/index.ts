/**
 * RapidAPI Module Index
 * 
 * Re-exports all RapidAPI helper functions for convenient imports.
 * 
 * Available APIs:
 * - Twitter Api (twitter-api65): User details, tweets, followers, search
 * - Twitter Data Scraper: User profile data
 * - Twitter Scraper: Advanced tweet scraping
 * - Get Twitter Mentions: Keyword-based mentions
 * - Sentiment Analysis: Text sentiment scoring
 * 
 * ⚠️ SERVER-SIDE ONLY - Never import this in frontend code!
 */

// =============================================================================
// TWITTER HELPERS
// =============================================================================

// Types
export type {
  TwitterUserProfile,
  TwitterTweet,
  TwitterTweetDetail,
  ScrapeTweetsParams,
  TwitterSearchOptions,
} from './twitter';

// twitter-api65 functions (require userId)
export {
  fetchUserDetailsByScreenName,
  fetchUserTweetsById,
  fetchFollowersByUserId,
  fetchVerifiedFollowersByUserId,
  fetchFollowingByUserId,
  fetchUserMediaByUserId,
  fetchHighlightedTweetsByUserId,
  fetchTweetDetail,
  searchTweets,
  searchUsers,
} from './twitter';

// Legacy functions (by handle, using other hosts)
export {
  fetchUserProfile,
  fetchUserTweets,
  fetchUserFollowersSample,
  scrapeTweetsBySearch,
  calculateFollowerQuality,
} from './twitter';

// =============================================================================
// MENTIONS HELPERS
// =============================================================================

export type {
  MentionResult,
  FetchMentionsParams,
} from './mentions';

export {
  fetchProjectMentions,
  fetchHandleMentions,
  fetchTickerMentions,
  calculateMentionStats,
} from './mentions';

// =============================================================================
// SENTIMENT HELPERS
// =============================================================================

export type {
  SentimentResult,
} from './sentiment';

export {
  analyzeSentiment,
  analyzeSentiments,
  analyzeSentimentsWithCache,
  analyzeTweetSentiments,
  cleanTweetText,
} from './sentiment';

// =============================================================================
// TWITTER DATA SCRAPER (twitter-data-scraper3.p.rapidapi.com)
// =============================================================================

export type {
  TwitterScraperUserInfo,
  TwitterScraperTimeline,
  TwitterScraperFollowers,
  TwitterScraperFollowing,
  TwitterScraperTweetInfo,
  TwitterScraperTrends,
  TwitterScraperSearchResults,
  TwitterScraperMediaTimeline,
  TwitterScraperRetweets,
  TwitterScraperReplies,
  TwitterScraperTweetThread,
  TwitterScraperLatestReplies,
  TwitterScraperCheckRetweet,
  TwitterScraperCheckFollow,
  TwitterScraperListTimeline,
  TwitterScraperListFollowers,
  TwitterScraperListMembers,
  TwitterScraperCommunityPosts,
  TwitterScraperCommunitySearchResults,
  TwitterScraperSpacesInfo,
  TwitterScraperProfilesByResult,
  TwitterScraperAffiliates,
} from './twitterScraper';

export {
  // User functions
  scraperFetchUserInfo,
  scraperFetchUserTimeline,
  scraperFetchFollowing,
  scraperFetchFollowers,
  scraperFetchAffiliates,
  scraperFetchUserMedia,
  scraperFetchReplies,
  scraperFetchProfilesByRestIds,
  // Tweet functions
  scraperFetchTweetInfo,
  scraperFetchRetweets,
  scraperFetchTweetThread,
  scraperFetchLatestReplies,
  scraperCheckRetweet,
  // Search & trends
  scraperSearch,
  scraperFetchTrends,
  // Relationship checks
  scraperCheckFollow,
  // List functions
  scraperFetchListTimeline,
  scraperFetchListFollowers,
  scraperFetchListMembers,
  // Community functions
  scraperFetchCommunityPosts,
  scraperSearchCommunities,
  scraperSearchCommunitiesTop,
  scraperSearchCommunitiesLatest,
  // Spaces
  scraperFetchSpacesInfo,
} from './twitterScraper';
