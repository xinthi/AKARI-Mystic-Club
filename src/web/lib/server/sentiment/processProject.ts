/**
 * Process Single Project - Web-local helper
 * 
 * This helper processes a single project for sentiment/metrics update.
 * It lives inside src/web so Vercel can bundle it.
 * 
 * This is equivalent to processProject from scripts/sentiment/updateAllProjects.ts
 * but uses imports that are resolvable from within src/web.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Import unified Twitter client from src/server (relative path from src/web/lib/server/sentiment)
import {
  unifiedGetUserInfo,
  unifiedGetUserLastTweets,
  unifiedGetUserFollowers,
  unifiedGetUserMentions,
  calculateFollowerQuality,
  calculateMentionStats,
  UnifiedUserProfile,
  UnifiedTweet,
  UnifiedMention,
} from '../../../../server/twitterClient';

// Import sentiment analyzer from src/server
import {
  analyzeTweetSentiments,
} from '../../../../server/sentiment/localAnalyzer';

// Import scoring functions from src/server
import {
  computeAkariScore,
  computeCtHeatScore,
  aggregateSentimentScore,
  computeSimplifiedAkariScore,
} from '../../../../server/scoring/akari';

// Import topic stats recomputation
import { recomputeProjectTopicStats } from '../../../../server/sentiment/topics';

// =============================================================================
// TYPES
// =============================================================================

export interface Project {
  id: string;
  slug: string;
  twitter_username: string | null;
  name: string;
  is_active: boolean;
}

interface DailyMetrics {
  project_id: string;
  date: string;
  sentiment_score: number;
  ct_heat_score: number;
  tweet_count: number;
  followers: number;
  akari_score: number;
}

interface ProjectTweetRow {
  project_id: string;
  tweet_id: string;
  tweet_url: string;
  author_handle: string;
  author_name: string;
  author_profile_image_url: string | null;
  created_at: string;
  text: string;
  likes: number;
  replies: number;
  retweets: number;
  is_official: boolean;
  is_kol: boolean;
}

interface ProjectUpdateData {
  twitter_profile_image_url?: string;
  bio?: string;
  last_refreshed_at: string;
}

export interface ProcessingResult {
  metrics: DailyMetrics;
  projectUpdate: ProjectUpdateData;
  tweets: ProjectTweetRow[];
}

export interface SentimentRunOptions {
  maxTweets?: number;
  maxMentions?: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const DELAY_BETWEEN_API_CALLS_MS = 500; // 500ms between API calls

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Process a single project and compute its daily metrics.
 * 
 * @param project - The project to process
 * @param date - The date string (YYYY-MM-DD) for metrics
 * @param supabase - Supabase client with service role
 * @param options - Optional limits for tweets/mentions
 */
export async function processProjectById(
  project: Project,
  date: string,
  supabase: SupabaseClient,
  options: SentimentRunOptions = {}
): Promise<ProcessingResult | null> {
  // Apply defaults
  const maxTweets = options.maxTweets ?? 20;
  const maxMentions = options.maxMentions ?? 100;

  // Get Twitter handle (use existing, don't auto-discover in admin refresh)
  const handle = project.twitter_username?.trim() || null;
  
  if (!handle) {
    console.log(`[processProjectById] No twitter_username for ${project.name}, skipping`);
    return null;
  }

  // Step 1: Fetch user profile
  console.log(`[processProjectById] Fetching profile for @${handle}...`);
  let profile: UnifiedUserProfile | null = null;
  try {
    profile = await unifiedGetUserInfo(handle);
  } catch (e: unknown) {
    const err = e as Error;
    console.log(`[processProjectById] Could not fetch profile: ${err.message}`);
  }
  await delay(DELAY_BETWEEN_API_CALLS_MS);

  if (!profile) {
    console.log(`[processProjectById] Profile not found for @${handle}, using defaults`);
    profile = {
      id: '',
      username: handle,
      name: handle,
      profileImageUrl: '',
      bio: '',
      followers: 0,
      following: 0,
      tweetCount: 0,
      isVerified: false,
      verifiedType: null,
      createdAt: '',
    } as UnifiedUserProfile;
  }

  const followersCount = profile.followers ?? 0;
  console.log(`[processProjectById] Followers: ${followersCount.toLocaleString()}`);

  // Step 2: Fetch recent tweets
  console.log(`[processProjectById] Fetching recent tweets (max: ${maxTweets})...`);
  let tweets: UnifiedTweet[] = [];
  try {
    tweets = await unifiedGetUserLastTweets(handle, maxTweets);
    console.log(`[processProjectById] Found ${tweets.length} tweets`);
  } catch (e: unknown) {
    const err = e as Error;
    console.log(`[processProjectById] Could not fetch tweets: ${err.message}`);
  }
  await delay(DELAY_BETWEEN_API_CALLS_MS);

  // Step 3: Fetch follower sample for quality score
  console.log(`[processProjectById] Fetching follower sample...`);
  let followerQuality = 50; // Default neutral
  try {
    const followers = await unifiedGetUserFollowers(handle, 30);
    if (followers.length > 0) {
      followerQuality = calculateFollowerQuality(followers);
      console.log(`[processProjectById] Follower quality score: ${followerQuality}`);
    }
  } catch (e: unknown) {
    const err = e as Error;
    console.log(`[processProjectById] Could not fetch followers: ${err.message}`);
  }
  await delay(DELAY_BETWEEN_API_CALLS_MS);

  // Step 4: Fetch mentions
  console.log(`[processProjectById] Fetching mentions (max: ${maxMentions})...`);
  let mentions: UnifiedMention[] = [];
  try {
    mentions = await unifiedGetUserMentions(handle, maxMentions);
    console.log(`[processProjectById] Found ${mentions.length} mentions`);
  } catch (e: unknown) {
    const err = e as Error;
    console.log(`[processProjectById] Could not fetch mentions: ${err.message}`);
  }
  await delay(DELAY_BETWEEN_API_CALLS_MS);

  // Step 5: Analyze sentiment
  console.log(`[processProjectById] Analyzing sentiment...`);
  let sentimentScore = 50; // Default neutral
  
  const allTexts: Array<{ text: string; likes: number; retweets: number; replies: number }> = [
    ...tweets.map((t) => ({ 
      text: t.text, 
      likes: t.likeCount ?? 0, 
      retweets: t.retweetCount ?? 0, 
      replies: t.replyCount ?? 0 
    })),
    ...mentions.map((m) => ({ 
      text: m.text, 
      likes: m.likeCount ?? 0, 
      retweets: m.retweetCount ?? 0, 
      replies: m.replyCount ?? 0 
    })),
  ];

  if (allTexts.length > 0) {
    try {
      const analyzedTexts = await analyzeTweetSentiments(allTexts);
      sentimentScore = aggregateSentimentScore(
        analyzedTexts.map((t) => ({
          sentimentScore: t.sentimentScore,
          likes: t.likes,
          retweets: t.retweets,
          replies: t.replies,
        }))
      );
      console.log(`[processProjectById] Sentiment score: ${sentimentScore}`);
    } catch (e: unknown) {
      const err = e as Error;
      console.log(`[processProjectById] Could not analyze sentiment: ${err.message}`);
    }
  }

  // Step 6: Compute CT Heat score
  const mentionStats = calculateMentionStats(mentions);
  const ctHeatScore = computeCtHeatScore(
    mentionStats.count,
    mentionStats.avgLikes,
    mentionStats.avgRetweets,
    mentionStats.uniqueAuthors,
    0 // influencerMentions - would need additional logic
  );
  console.log(`[processProjectById] CT Heat score: ${ctHeatScore}`);

  // Step 7: Compute AKARI score
  let akariScore: number;
  
  if (tweets.length >= 5) {
    const avgLikes = tweets.reduce((sum, t) => sum + (t.likeCount ?? 0), 0) / tweets.length;
    const avgReplies = tweets.reduce((sum, t) => sum + (t.replyCount ?? 0), 0) / tweets.length;
    const avgRetweets = tweets.reduce((sum, t) => sum + (t.retweetCount ?? 0), 0) / tweets.length;

    const engagementValues = tweets.map((t) => (t.likeCount ?? 0) + (t.replyCount ?? 0) + (t.retweetCount ?? 0));
    const avgEngagement = engagementValues.reduce((a, b) => a + b, 0) / engagementValues.length;
    const variance = engagementValues.reduce((sum, v) => sum + Math.pow(v - avgEngagement, 2), 0) / engagementValues.length;
    const stdDev = Math.sqrt(variance);

    let accountAgeYears = 1;
    if (profile.createdAt) {
      const accountAgeMs = Date.now() - new Date(profile.createdAt).getTime();
      accountAgeYears = accountAgeMs / (365.25 * 24 * 60 * 60 * 1000);
    }

    akariScore = computeAkariScore({
      followers: followersCount,
      following: profile.following ?? 0,
      accountAgeYears,
      avgLikesPerTweet: avgLikes,
      avgRepliesPerTweet: avgReplies,
      avgRetweetsPerTweet: avgRetweets,
      engagementStdDev: stdDev,
      followerQualitySample: followerQuality,
      tweetSampleSize: tweets.length,
    });
  } else {
    const avgEngagement = tweets.length > 0
      ? tweets.reduce((sum, t) => sum + (t.likeCount ?? 0) + (t.replyCount ?? 0) + (t.retweetCount ?? 0), 0) / tweets.length
      : 0;
    
    let accountAgeYears = 1;
    if (profile.createdAt) {
      const accountAgeMs = Date.now() - new Date(profile.createdAt).getTime();
      accountAgeYears = accountAgeMs / (365.25 * 24 * 60 * 60 * 1000);
    }

    akariScore = computeSimplifiedAkariScore(
      followersCount,
      profile.following ?? 0,
      avgEngagement,
      accountAgeYears
    );
  }

  console.log(`[processProjectById] AKARI score: ${akariScore}`);

  // Build project update data
  const projectUpdate: ProjectUpdateData = {
    last_refreshed_at: new Date().toISOString(),
  };

  if (profile.profileImageUrl) {
    projectUpdate.twitter_profile_image_url = profile.profileImageUrl;
  }

  if (profile.bio) {
    projectUpdate.bio = profile.bio;
  }

  // Build tweet rows for project's own tweets
  const projectTweetRows: ProjectTweetRow[] = tweets.slice(0, 10).map((t) => {
    const authorUsername = t.authorUsername || handle;
    return {
      project_id: project.id,
      tweet_id: t.id,
      tweet_url: `https://x.com/${authorUsername}/status/${t.id}`,
      author_handle: authorUsername,
      author_name: t.authorName || handle,
      author_profile_image_url: t.authorProfileImageUrl || profile.profileImageUrl || null,
      created_at: t.createdAt || new Date().toISOString(),
      text: t.text || '',
      likes: t.likeCount ?? 0,
      replies: t.replyCount ?? 0,
      retweets: t.retweetCount ?? 0,
      is_official: true,
      is_kol: false,
    };
  });

  // Build tweet rows for mentions
  const KOL_ENGAGEMENT_THRESHOLD = 20;
  const mentionTweetRows: ProjectTweetRow[] = mentions.slice(0, 20).map((m) => {
    const totalEngagement = (m.likeCount ?? 0) + (m.retweetCount ?? 0) * 2;
    const authorHandle = m.author || 'unknown';
    const tweetUrl = m.url || `https://x.com/${authorHandle}/status/${m.id}`;
    return {
      project_id: project.id,
      tweet_id: m.id,
      tweet_url: tweetUrl,
      author_handle: authorHandle,
      author_name: authorHandle,
      author_profile_image_url: null,
      created_at: m.createdAt || new Date().toISOString(),
      text: m.text || '',
      likes: m.likeCount ?? 0,
      replies: m.replyCount ?? 0,
      retweets: m.retweetCount ?? 0,
      is_official: false,
      is_kol: totalEngagement >= KOL_ENGAGEMENT_THRESHOLD,
    };
  });

  const tweetRows: ProjectTweetRow[] = [...projectTweetRows, ...mentionTweetRows];

  // Return compiled metrics, project update data, and tweets
  return {
    metrics: {
      project_id: project.id,
      date,
      sentiment_score: sentimentScore,
      ct_heat_score: ctHeatScore,
      tweet_count: tweets.length + mentions.length,
      followers: followersCount,
      akari_score: akariScore,
    },
    projectUpdate,
    tweets: tweetRows,
  };
}

// =============================================================================
// UTILITIES
// =============================================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

