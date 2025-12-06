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
 * - RAPIDAPI_KEY
 */

// Load environment variables from .env at project root
import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';

// Import our helper modules
import {
  fetchUserProfile,
  fetchUserTweets,
  fetchUserFollowersSample,
  calculateFollowerQuality,
  scrapeTweetsBySearch,
  TwitterTweet,
  TwitterUserProfile,
} from '../../src/server/rapidapi/twitter';
import {
  fetchProjectMentions,
  calculateMentionStats,
  MentionResult,
} from '../../src/server/rapidapi/mentions';
import {
  analyzeTweetSentiments,
} from '../../src/server/rapidapi/sentiment';
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

// Rate limiting settings
const DELAY_BETWEEN_PROJECTS_MS = 2000; // 2 seconds between projects
const DELAY_BETWEEN_API_CALLS_MS = 500; // 500ms between API calls

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface Project {
  id: string;
  slug: string;
  x_handle: string;
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

interface ProjectUpdateData {
  avatar_url?: string;
  bio?: string;
  last_refreshed_at: string;
}

interface ProcessingResult {
  metrics: DailyMetrics;
  projectUpdate: ProjectUpdateData;
}

// =============================================================================
// MAIN SCRIPT
// =============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('AKARI Sentiment Update Script');
  console.log('Started at:', new Date().toISOString());
  console.log('='.repeat(60));

  // Validate environment variables
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('   - SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
    console.error('   - SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗');
    process.exit(1);
  }

  if (!process.env.RAPIDAPI_KEY) {
    console.error('❌ Missing RAPIDAPI_KEY environment variable');
    process.exit(1);
  }

  // Create Supabase client with service role (write access)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    // Fetch all active projects
    console.log('\n📋 Fetching active projects...');
    const { data: projects, error: fetchError } = await supabase
      .from('projects')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (fetchError) {
      console.error('❌ Error fetching projects:', fetchError);
      process.exit(1);
    }

    if (!projects || projects.length === 0) {
      console.log('⚠️  No active projects found. Nothing to update.');
      process.exit(0);
    }

    console.log(`✅ Found ${projects.length} active project(s)\n`);

    // Process each project
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      console.log(`\n[${i + 1}/${projects.length}] Processing: ${project.name} (@${project.x_handle})`);

      try {
        const result = await processProject(project, today);
        
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
            console.log(`      AKARI: ${result.metrics.akari_score} | Sentiment: ${result.metrics.sentiment_score} | CT Heat: ${result.metrics.ct_heat_score}`);
            successCount++;

            // Update project with profile data (avatar, bio, etc.)
            const { error: updateError } = await supabase
              .from('projects')
              .update(result.projectUpdate)
              .eq('id', project.id);

            if (updateError) {
              console.error(`   ⚠️  Failed to update project profile:`, updateError.message);
            } else if (result.projectUpdate.avatar_url) {
              console.log(`   📷 Updated avatar URL`);
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
      if (i < projects.length - 1) {
        await delay(DELAY_BETWEEN_PROJECTS_MS);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Update Complete!');
    console.log(`Successful: ${successCount} | Failed: ${failCount}`);
    console.log('Finished at:', new Date().toISOString());
    console.log('='.repeat(60));

    process.exit(failCount > 0 ? 1 : 0);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('\n❌ Fatal error:', err.message);
    process.exit(1);
  }
}

// =============================================================================
// PROJECT PROCESSING
// =============================================================================

/**
 * Process a single project and compute its daily metrics.
 * Also returns profile data (avatar, bio) to update the project.
 */
async function processProject(project: Project, date: string): Promise<ProcessingResult | null> {
  const handle = project.x_handle;

  // Step 1: Fetch user profile
  console.log(`   Fetching profile for @${handle}...`);
  let profile: TwitterUserProfile | null = null;
  try {
    profile = await fetchUserProfile(handle);
  } catch (e: unknown) {
    const err = e as Error;
    console.log(`   ⚠️  Could not fetch profile: ${err.message}`);
  }
  await delay(DELAY_BETWEEN_API_CALLS_MS);

  if (!profile) {
    console.log(`   ⚠️  Profile not found for @${handle}, using defaults`);
    profile = { handle };
  }

  const followersCount = profile.followersCount ?? 0;
  console.log(`   Followers: ${followersCount.toLocaleString()}`);

  // Step 2: Fetch recent tweets
  console.log(`   Fetching recent tweets...`);
  let tweets: TwitterTweet[] = [];
  try {
    tweets = await fetchUserTweets(handle, 20);
    console.log(`   Found ${tweets.length} tweets`);
  } catch (e: unknown) {
    const err = e as Error;
    console.log(`   ⚠️  Could not fetch tweets: ${err.message}`);
  }
  await delay(DELAY_BETWEEN_API_CALLS_MS);

  // Step 3: Fetch follower sample for quality score
  console.log(`   Fetching follower sample...`);
  let followerQuality = 50; // Default neutral
  try {
    const followers = await fetchUserFollowersSample(handle, 30);
    if (followers.length > 0) {
      followerQuality = calculateFollowerQuality(followers);
      console.log(`   Follower quality score: ${followerQuality}`);
    }
  } catch (e: unknown) {
    const err = e as Error;
    console.log(`   ⚠️  Could not fetch followers: ${err.message}`);
  }
  await delay(DELAY_BETWEEN_API_CALLS_MS);

  // Step 4: Fetch mentions
  console.log(`   Fetching mentions...`);
  let mentions: MentionResult[] = [];
  try {
    // Fetch mentions for the handle
    mentions = await fetchProjectMentions({
      keyword: `@${handle}`,
      periodDays: 1,
      limit: 100,
    });
    console.log(`   Found ${mentions.length} mentions`);
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
      following: profile.followingCount ?? 0,
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
      profile.followingCount ?? 0,
      avgEngagement,
      accountAgeYears
    );
  }

  console.log(`   AKARI score: ${akariScore}`);

  // Build project update data (avatar, bio from profile)
  const projectUpdate: ProjectUpdateData = {
    last_refreshed_at: new Date().toISOString(),
  };

  // Add avatar URL if we got one from the profile
  if (profile.avatarUrl) {
    projectUpdate.avatar_url = profile.avatarUrl;
    console.log(`   📷 Found avatar: ${profile.avatarUrl.substring(0, 50)}...`);
  }

  // Add bio if we got one from the profile
  if (profile.bio) {
    projectUpdate.bio = profile.bio;
  }

  // Return compiled metrics and project update data
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
// RUN
// =============================================================================

main();
