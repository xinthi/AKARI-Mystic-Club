/**
 * Background Script: Update All Projects Sentiment
 * 
 * This script runs as a cron job to:
 * 1. Fetch all active projects from Supabase
 * 2. For each project, fetch Twitter data and analyze sentiment
 * 3. Compute daily metrics and upsert to Supabase
 * 
 * Run with: pnpm sentiment:update
 * Or: npx ts-node scripts/sentiment/updateAllProjects.ts
 * 
 * Environment variables required:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - TWITTER_PRIMARY_PROVIDER: "twitterapiio" (only twitterapiio is supported)
 * - TWITTERAPIIO_API_KEY (if using TwitterAPI.io)
 * - RAPIDAPI_KEY (if using RapidAPI or as fallback)
 */

// Load environment variables from .env at project root
import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';

// Import unified Twitter client
import {
  unifiedGetUserInfo,
  unifiedGetUserLastTweets,
  unifiedGetUserFollowers,
  unifiedSearchUsers,
  calculateFollowerQuality,
  unifiedGetUserMentions,
  calculateMentionStats,
  UnifiedUserProfile,
  UnifiedTweet,
  UnifiedMention,
} from '../../src/server/twitterClient';

// Use local sentiment analyzer (no external API)
import {
  analyzeTweetSentiments,
} from '../../src/server/sentiment/localAnalyzer';
import {
  computeAkariScore,
  computeCtHeatScore,
  aggregateSentimentScore,
  computeSimplifiedAkariScore,
} from '../../src/server/scoring/akari';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRIMARY_PROVIDER = process.env.TWITTER_PRIMARY_PROVIDER ?? 'twitterapiio';

// Rate limiting settings
const DELAY_BETWEEN_PROJECTS_MS = 2000; // 2 seconds between projects
const DELAY_BETWEEN_API_CALLS_MS = 500; // 500ms between API calls

// =============================================================================
// TYPE DEFINITIONS
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

interface ProcessingResult {
  metrics: DailyMetrics;
  projectUpdate: ProjectUpdateData;
  tweets: ProjectTweetRow[];
}

// =============================================================================
// OPTIONAL PARAMETERS FOR DEEP REFRESH
// =============================================================================

/**
 * Options for controlling tweet/mention limits during processing.
 * All existing calls can omit these for backwards compatibility.
 */
export interface SentimentRunOptions {
  /** Max tweets to fetch from the project's timeline (default: 20) */
  maxTweets?: number;
  /** Max mentions to fetch (tweets mentioning the project) (default: 100) */
  maxMentions?: number;
}

// =============================================================================
// MAIN FUNCTION (Exported for API routes)
// =============================================================================

/**
 * Run the sentiment update job.
 * This function can be called from CLI or from an API route.
 * Returns a summary of the update results.
 */
export async function runSentimentUpdate(): Promise<{ successCount: number; failCount: number }> {
  console.log('='.repeat(60));
  console.log('AKARI Sentiment Update Script');
  console.log('Started at:', new Date().toISOString());
  console.log('Primary Twitter provider:', PRIMARY_PROVIDER);
  console.log('='.repeat(60));

  // Validate environment variables
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('   - SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
    console.error('   - SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗');
    throw new Error('Missing required Supabase environment variables');
  }

  // Check for at least one Twitter API key
  const hasTwitterApiIo = Boolean(process.env.TWITTERAPIIO_API_KEY);
  const hasRapidApi = Boolean(process.env.RAPIDAPI_KEY);
  
  if (!hasTwitterApiIo && !hasRapidApi) {
    console.error('❌ Missing Twitter API credentials:');
    console.error('   - TWITTERAPIIO_API_KEY:', hasTwitterApiIo ? '✓' : '✗');
    console.error('   - RAPIDAPI_KEY:', hasRapidApi ? '✓' : '✗');
    console.error('   At least one provider must be configured.');
    throw new Error('Missing Twitter API credentials');
  }

  console.log('API credentials:');
  console.log('   - TwitterAPI.io:', hasTwitterApiIo ? '✓' : '✗');
  console.log('   - RapidAPI:', hasRapidApi ? '✓' : '✗');

  // Create Supabase client with service role (write access)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    // Fetch all active projects with twitter_username set
    console.log('\n📋 Fetching active projects with twitter_username...');
    const { data: projects, error: fetchError } = await supabase
      .from('projects')
      .select('*')
      .eq('is_active', true)
      .not('twitter_username', 'is', null) // Only process projects with twitter_username
      .order('name');

    if (fetchError) {
      console.error('❌ Error fetching projects:', fetchError);
      throw new Error(`Failed to fetch projects: ${fetchError.message}`);
    }

    if (!projects || projects.length === 0) {
      console.log('⚠️  No active projects with twitter_username found. Nothing to update.');
      return { successCount: 0, failCount: 0 };
    }

    // Double-check: filter out any projects with empty twitter_username
    const validProjects = projects.filter(p => p.twitter_username?.trim());
    console.log(`✅ Found ${validProjects.length} active project(s) with twitter_username\n`);
    
    if (validProjects.length === 0) {
      console.log('⚠️  All projects have empty twitter_username. Nothing to update.');
      return { successCount: 0, failCount: 0 };
    }

    // Process each project
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < validProjects.length; i++) {
      const project = validProjects[i];
      console.log(`\n[${i + 1}/${validProjects.length}] Processing: ${project.name} (@${project.twitter_username})`);

      try {
        const result = await processProject(project, today, supabase);
        
        if (result) {
          // Upsert metrics to Supabase
          const { error: upsertError } = await supabase
            .from('metrics_daily')
            .upsert(result.metrics, {
              onConflict: 'project_id,date',
            });

          if (upsertError) {
            console.error(`   ❌ Failed to save metrics:`, upsertError.message);
            failCount++;
          } else {
            console.log(`   ✅ Metrics saved successfully`);
            console.log(`      AKARI: ${result.metrics.akari_score} | Sentiment: ${result.metrics.sentiment_score} | CT Heat: ${result.metrics.ct_heat_score} | Tweets: ${result.metrics.tweet_count}`);
            successCount++;

            // Update project with profile data (avatar, bio, etc.)
            const { error: updateError } = await supabase
              .from('projects')
              .update(result.projectUpdate)
              .eq('id', project.id);

            if (updateError) {
              console.error(`   ⚠️  Failed to update project profile:`, updateError.message);
            } else if (result.projectUpdate.twitter_profile_image_url) {
              console.log(`   📷 Updated profile image URL`);
            }

            // Save tweets to project_tweets table
            if (result.tweets.length > 0) {
              const { error: tweetsError } = await supabase
                .from('project_tweets')
                .upsert(result.tweets, {
                  onConflict: 'project_id,tweet_id',
                });

              if (tweetsError) {
                console.error(`   ⚠️  Failed to save tweets:`, tweetsError.message);
              } else {
                console.log(`   📝 Saved ${result.tweets.length} tweets`);
              }
            }
          }
        } else {
          console.log(`   ⚠️  No metrics generated (API may have returned no data)`);
          failCount++;
        }
      } catch (error: unknown) {
        const err = error as Error;
        console.error(`   ❌ Error processing project:`, err.message);
        failCount++;
      }

      // Rate limiting delay between projects
      if (i < validProjects.length - 1) {
        await delay(DELAY_BETWEEN_PROJECTS_MS);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Update Complete!');
    console.log(`Successful: ${successCount} | Failed: ${failCount}`);
    console.log('Finished at:', new Date().toISOString());
    console.log('='.repeat(60));

    return { successCount, failCount };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('\n❌ Fatal error:', err.message);
    throw err;
  }
}

// =============================================================================
// AUTO-DISCOVERY
// =============================================================================

/**
 * Clean a string for Twitter search (remove emojis, special chars)
 */
function cleanSearchQuery(query: string): string {
  // Remove emojis and special Unicode characters
  return query
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Emojis
    .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
    .replace(/[^\w\s-]/g, '')               // Non-word characters
    .trim();
}

/**
 * Auto-discover Twitter username for a project that doesn't have one.
 * Searches by project name, slug, and picks the best match.
 * 
 * IMPORTANT: twitter_username is an admin-controlled field.
 * Never overwrite a non-empty value. Auto-discovery only runs if empty.
 */
async function autoDiscoverTwitterUsername(
  supabase: any,
  project: Project
): Promise<string | null> {
  // IMPORTANT: twitter_username is an admin-controlled field.
  // Never overwrite a non-empty value. Auto-discovery only runs if empty.
  if (project.twitter_username && project.twitter_username.trim() !== '') {
    console.log(`   ℹ️ twitter_username already set to @${project.twitter_username}, using existing value`);
    return project.twitter_username;
  }

  console.log(`   🔍 Auto-discovering Twitter username for ${project.name}...`);

  try {
    // Clean the project name and create search variants
    const cleanName = cleanSearchQuery(project.name);
    const cleanSlug = cleanSearchQuery(project.slug);
    
    // Build search queries - try multiple variants
    const searchQueries = [
      cleanName,
      cleanSlug,
      // Also try without spaces (common for crypto projects)
      cleanName.replace(/\s+/g, ''),
    ].filter((q, i, arr) => q.length >= 2 && arr.indexOf(q) === i); // Dedupe and filter short queries

    console.log(`      Search queries: ${searchQueries.map(q => `"${q}"`).join(', ')}`);
    
    const allCandidates: UnifiedUserProfile[] = [];

    for (const query of searchQueries) {
      try {
        const results = await unifiedSearchUsers(query, 10);
        console.log(`      Search "${query}": found ${results.length} results`);
        allCandidates.push(...results);
        await delay(500);
      } catch (e: any) {
        console.log(`      Search for "${query}" failed: ${e.message}`);
      }
    }

    if (allCandidates.length === 0) {
      console.log(`      No candidates found for ${project.name} - you may need to set twitter_username manually`);
      return null;
    }

    // Deduplicate by username
    const uniqueCandidates = Array.from(
      new Map(allCandidates.map(c => [c.username.toLowerCase(), c])).values()
    );

    // Log top candidates for debugging
    console.log(`      Found ${uniqueCandidates.length} unique candidates:`);
    uniqueCandidates.slice(0, 5).forEach((c, i) => {
      console.log(`        ${i + 1}. @${c.username} (${c.name || 'no name'}) - ${c.followers} followers`);
    });

    // Find best match:
    // 1. Exact name match (case-insensitive, cleaned)
    // 2. Username matches slug
    // 3. Name contains project name
    // 4. Highest follower count
    const cleanProjectName = cleanSearchQuery(project.name).toLowerCase();
    const exactMatch = uniqueCandidates.find(c => {
      const cleanCandidateName = cleanSearchQuery(c.name || '').toLowerCase();
      return cleanCandidateName === cleanProjectName ||
             c.username.toLowerCase() === project.slug.toLowerCase() ||
             cleanCandidateName.includes(cleanProjectName) ||
             cleanProjectName.includes(cleanCandidateName);
    });

    const bestCandidate = exactMatch || 
      uniqueCandidates.sort((a, b) => b.followers - a.followers)[0];

    if (bestCandidate) {
      // IMPORTANT: Only write to twitter_username if it was empty.
      // This is a one-time discovery. After this, admin controls the value.
      // The .is('twitter_username', null) ensures we never overwrite an existing value.
      const { error } = await supabase
        .from('projects')
        .update({ twitter_username: bestCandidate.username })
        .eq('id', project.id)
        .is('twitter_username', null); // Only update if still NULL

      if (error) {
        console.log(`      Failed to update twitter_username: ${error.message}`);
        return null;
      }

      console.log(`   ✓ Auto-discovered twitter_username: @${bestCandidate.username}`);
      return bestCandidate.username;
    }
  } catch (error: any) {
    console.log(`      Auto-discovery error: ${error.message}`);
  }

  return null;
}

// =============================================================================
// PROJECT PROCESSING
// =============================================================================

/**
 * Process a single project and compute its daily metrics.
 * Also returns profile data (avatar, bio) to update the project.
 * 
 * IMPORTANT: This function NEVER modifies twitter_username.
 * It only reads the existing handle or auto-discovers if empty.
 * 
 * @param project - The project to process
 * @param date - The date string (YYYY-MM-DD) for metrics
 * @param supabase - Supabase client
 * @param options - Optional limits for tweets/mentions (for deep refresh)
 */
export async function processProject(
  project: Project, 
  date: string,
  supabase: any,
  options: SentimentRunOptions = {}
): Promise<ProcessingResult | null> {
  // Apply defaults for backwards compatibility
  const maxTweets = options.maxTweets ?? 20;
  const maxMentions = options.maxMentions ?? 100;
  // IMPORTANT: twitter_username is an admin-controlled field.
  // Use existing handle if set, only auto-discover if NULL/empty.
  let handle = project.twitter_username?.trim() || null;
  
  if (!handle) {
    handle = await autoDiscoverTwitterUsername(supabase, project);
    if (!handle) {
      console.log(`   ⚠️ No twitter_username for ${project.name}, skipping`);
      return null;
    }
  }

  // Step 1: Fetch user profile using unified client
  console.log(`   Fetching profile for @${handle}...`);
  let profile: UnifiedUserProfile | null = null;
  try {
    profile = await unifiedGetUserInfo(handle);
  } catch (e: unknown) {
    const err = e as Error;
    console.log(`   ⚠️  Could not fetch profile: ${err.message}`);
  }
  await delay(DELAY_BETWEEN_API_CALLS_MS);

  if (!profile) {
    console.log(`   ⚠️  Profile not found for @${handle}, using defaults`);
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
  console.log(`   Followers: ${followersCount.toLocaleString()}`);

  // Step 2: Fetch recent tweets using unified client
  console.log(`   Fetching recent tweets (max: ${maxTweets})...`);
  let tweets: UnifiedTweet[] = [];
  try {
    tweets = await unifiedGetUserLastTweets(handle, maxTweets);
    console.log(`   Found ${tweets.length} tweets`);
  } catch (e: unknown) {
    const err = e as Error;
    console.log(`   ⚠️  Could not fetch tweets: ${err.message}`);
  }
  await delay(DELAY_BETWEEN_API_CALLS_MS);

  // Step 3: Fetch follower sample for quality score using unified client
  console.log(`   Fetching follower sample...`);
  let followerQuality = 50; // Default neutral
  try {
    const followers = await unifiedGetUserFollowers(handle, 30);
    if (followers.length > 0) {
      followerQuality = calculateFollowerQuality(followers);
      console.log(`   Follower quality score: ${followerQuality}`);
    }
  } catch (e: unknown) {
    const err = e as Error;
    console.log(`   ⚠️  Could not fetch followers: ${err.message}`);
  }
  await delay(DELAY_BETWEEN_API_CALLS_MS);

  // Step 4: Fetch mentions using TwitterAPI.io (not RapidAPI)
  console.log(`   Fetching mentions via TwitterAPI.io (max: ${maxMentions})...`);
  let mentions: UnifiedMention[] = [];
  try {
    mentions = await unifiedGetUserMentions(handle, maxMentions);
    console.log(`   Found ${mentions.length} mentions for @${handle}`);
  } catch (e: unknown) {
    const err = e as Error;
    console.log(`   ⚠️  Could not fetch mentions: ${err.message}`);
  }
  await delay(DELAY_BETWEEN_API_CALLS_MS);

  // Step 5: Analyze sentiment
  console.log(`   Analyzing sentiment...`);
  let sentimentScore = 50; // Default neutral
  
  // Combine tweets and mentions for sentiment analysis
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
      console.log(`   Sentiment score: ${sentimentScore}`);
    } catch (e: unknown) {
      const err = e as Error;
      console.log(`   ⚠️  Could not analyze sentiment: ${err.message}`);
    }
  }

  // Step 6: Compute CT Heat score
  const mentionStats = calculateMentionStats(mentions);
  const ctHeatScore = computeCtHeatScore(
    mentionStats.count,
    mentionStats.avgLikes,
    mentionStats.avgRetweets,
    mentionStats.uniqueAuthors,
    0 // influencerMentions - would need additional logic to determine
  );
  console.log(`   CT Heat score: ${ctHeatScore}`);

  // Step 7: Compute AKARI score
  let akariScore: number;
  
  if (tweets.length >= 5) {
    // We have enough tweets to compute engagement metrics
    const avgLikes = tweets.reduce((sum, t) => sum + (t.likeCount ?? 0), 0) / tweets.length;
    const avgReplies = tweets.reduce((sum, t) => sum + (t.replyCount ?? 0), 0) / tweets.length;
    const avgRetweets = tweets.reduce((sum, t) => sum + (t.retweetCount ?? 0), 0) / tweets.length;

    // Calculate engagement variance
    const engagementValues = tweets.map((t) => (t.likeCount ?? 0) + (t.replyCount ?? 0) + (t.retweetCount ?? 0));
    const avgEngagement = engagementValues.reduce((a, b) => a + b, 0) / engagementValues.length;
    const variance = engagementValues.reduce((sum, v) => sum + Math.pow(v - avgEngagement, 2), 0) / engagementValues.length;
    const stdDev = Math.sqrt(variance);

    // Calculate account age in years (use profile.createdAt if available)
    let accountAgeYears = 1; // Default to 1 year if unknown
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
    // Not enough tweets, use simplified calculation
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

  console.log(`   AKARI score: ${akariScore}`);

  // Build project update data (profile image, bio from profile)
  const projectUpdate: ProjectUpdateData = {
    last_refreshed_at: new Date().toISOString(),
  };

  // Add profile image URL if we got one from the Twitter profile
  const profileImageUrl = profile.profileImageUrl;
  if (profileImageUrl) {
    projectUpdate.twitter_profile_image_url = profileImageUrl;
    console.log(`   📷 Found profile image: ${profileImageUrl.substring(0, 50)}...`);
  }

  // Add bio if we got one from the profile
  if (profile.bio) {
    projectUpdate.bio = profile.bio;
  }

  // Build tweet rows for saving to DB - project's own tweets
  // IMPORTANT: Always use project handle as fallback for author since these are project's own tweets
  const projectTweetRows: ProjectTweetRow[] = tweets.slice(0, 10).map((t) => {
    const authorUsername = t.authorUsername || handle; // Fallback to project handle
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
      is_official: true, // These are the project's own tweets
      is_kol: false,
    };
  });

  // Build tweet rows for mentions - tweets from others mentioning the project
  // A mention is considered "KOL" if it has decent engagement (likes + retweets*2 >= threshold)
  // Lower threshold to capture more KOL mentions (20 = ~10 likes or 5 retweets)
  const KOL_ENGAGEMENT_THRESHOLD = 20;
  const mentionTweetRows: ProjectTweetRow[] = mentions.slice(0, 20).map((m) => {
    const totalEngagement = (m.likeCount ?? 0) + (m.retweetCount ?? 0) * 2;
    const authorHandle = m.author || 'unknown';
    // IMPORTANT: Use the URL from API response, which contains correct username
    const tweetUrl = m.url || `https://x.com/${authorHandle}/status/${m.id}`;
    return {
      project_id: project.id,
      tweet_id: m.id,
      tweet_url: tweetUrl,
      author_handle: authorHandle,
      author_name: authorHandle, // Use handle as name since we don't have display name
      author_profile_image_url: null, // We don't have this from mentions API
      created_at: m.createdAt || new Date().toISOString(),
      text: m.text || '',
      likes: m.likeCount ?? 0,
      replies: m.replyCount ?? 0,
      retweets: m.retweetCount ?? 0,
      is_official: false, // These are mentions from others, not the project
      is_kol: totalEngagement >= KOL_ENGAGEMENT_THRESHOLD, // Mark as KOL if high engagement
    };
  });

  // Combine all tweets
  const tweetRows: ProjectTweetRow[] = [...projectTweetRows, ...mentionTweetRows];

  // Validation logging
  console.log(`   📊 VALIDATION LOG:`);
  console.log(`      - project.slug: ${project.slug}`);
  console.log(`      - twitter_username: ${handle} (${project.twitter_username ? 'existing' : 'auto-discovered'})`);
  console.log(`      - project tweets: ${projectTweetRows.length}`);
  console.log(`      - mention tweets: ${mentionTweetRows.length} (${mentionTweetRows.filter(t => t.is_kol).length} KOL)`);
  console.log(`      - total to upsert: ${tweetRows.length}`);
  console.log(`      - followers: ${followersCount}`);
  
  // Debug: Show first tweet's engagement data
  if (projectTweetRows.length > 0) {
    const firstTweet = projectTweetRows[0];
    console.log(`      - Sample project tweet: ${firstTweet.tweet_id}`);
    console.log(`        URL: ${firstTweet.tweet_url}`);
    console.log(`        Engagement: ❤️${firstTweet.likes} 🔁${firstTweet.retweets} 💬${firstTweet.replies}`);
  }
  if (mentionTweetRows.length > 0) {
    const firstMention = mentionTweetRows[0];
    console.log(`      - Sample mention: ${firstMention.tweet_id}`);
    console.log(`        URL: ${firstMention.tweet_url}`);
    console.log(`        Engagement: ❤️${firstMention.likes} 🔁${firstMention.retweets} 💬${firstMention.replies}`);
  }

  // Return compiled metrics, project update data, and tweets
  return {
    metrics: {
      project_id: project.id,
      date,
      sentiment_score: sentimentScore,
      ct_heat_score: ctHeatScore,
      tweet_count: tweets.length + mentions.length, // Activity count for the day
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

/**
 * Delay execution for a specified time.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// CLI ENTRY POINT
// =============================================================================

// Run when executed directly (not imported)
if (require.main === module) {
  runSentimentUpdate()
    .then((result) => {
      process.exit(result.failCount > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Script failed:', err);
      process.exit(1);
    });
}
