/**
 * Deep Refresh Script for Special Profiles
 * 
 * One-time script to run a deeper sentiment + inner circle refresh for
 * specific high-priority X accounts (for social promo purposes).
 * 
 * This script:
 * 1. Finds the specified profiles in the projects table
 * 2. Runs sentiment update with higher tweet/mention limits
 * 3. Rebuilds inner circle with higher member limit
 * 
 * Run with:
 *   cd scripts && npx ts-node sentiment/deepRefreshSpecialProfiles.ts
 * 
 * Or with explicit env:
 *   SUPABASE_SERVICE_ROLE_KEY=... TWITTERAPIIO_API_KEY=... npx ts-node scripts/sentiment/deepRefreshSpecialProfiles.ts
 * 
 * Environment variables required:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - TWITTERAPIIO_API_KEY
 */

import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Import the updated helpers with optional parameters
import { 
  processProject as processSentiment, 
  SentimentRunOptions,
  Project,
} from './updateAllProjects';

import { 
  processProject as processInnerCircle, 
  InnerCircleRunOptions,
  DbProject,
} from './updateInnerCircle';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Special profiles to deep refresh.
 * These are already tracked in the system - we just want more data.
 */
const SPECIAL_HANDLES = [
  { xHandle: 'zachxbt', slug: 'zachxbt' },
  { xHandle: 'pepecoineth', slug: 'pepecoineth' },
];

/**
 * Deep refresh limits (higher than normal cron defaults)
 */
const DEEP_REFRESH_LIMITS = {
  // Sentiment: more tweets and mentions
  maxTweets: 40,      // Default is 20
  maxMentions: 80,    // Default is 100, but we want targeted fetch
  
  // Inner circle: more followers to analyze, more members to save
  maxFollowersToFetch: 800,  // Default is 500
  maxInnerCircleSize: 60,    // Default is 100, but we want top 60 quality
};

// Rate limiting between profiles
const DELAY_BETWEEN_PROFILES_MS = 5000; // 5 seconds

// =============================================================================
// HELPERS
// =============================================================================

function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] ${message}`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// FIND PROJECT
// =============================================================================

/**
 * Find a project by slug or x_handle
 */
async function findProject(
  supabase: SupabaseClient,
  xHandle: string,
  slug: string
): Promise<Project | null> {
  // Try to find by slug first
  const { data: bySlug } = await supabase
    .from('projects')
    .select('*')
    .eq('slug', slug.toLowerCase())
    .single();

  if (bySlug) {
    return bySlug as Project;
  }

  // Try by x_handle
  const { data: byHandle } = await supabase
    .from('projects')
    .select('*')
    .ilike('twitter_username', xHandle)
    .single();

  if (byHandle) {
    return byHandle as Project;
  }

  // Try by x_handle column (some projects use this)
  const { data: byXHandle } = await supabase
    .from('projects')
    .select('*')
    .ilike('x_handle', xHandle)
    .single();

  return byXHandle as Project | null;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

interface RefreshResult {
  handle: string;
  projectId: string | null;
  found: boolean;
  sentimentResult?: {
    tweetsFetched: number;
    mentionsFetched: number;
  };
  innerCircleResult?: {
    membersSaved: number;
    totalPower: number;
  };
  error?: string;
}

async function deepRefreshSpecialProfiles(): Promise<RefreshResult[]> {
  log('========================================');
  log('AKARI Deep Refresh - Special Profiles');
  log('========================================');
  log(`Profiles to refresh: ${SPECIAL_HANDLES.map(h => '@' + h.xHandle).join(', ')}`);
  log(`Limits: tweets=${DEEP_REFRESH_LIMITS.maxTweets}, mentions=${DEEP_REFRESH_LIMITS.maxMentions}, innerCircle=${DEEP_REFRESH_LIMITS.maxInnerCircleSize}`);
  log('========================================\n');

  // Validate environment
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  if (!process.env.TWITTERAPIIO_API_KEY) {
    throw new Error('Missing TWITTERAPIIO_API_KEY - required for Twitter API calls');
  }

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const results: RefreshResult[] = [];
  const today = new Date().toISOString().split('T')[0];

  // Process each special profile
  for (let i = 0; i < SPECIAL_HANDLES.length; i++) {
    const { xHandle, slug } = SPECIAL_HANDLES[i];
    log(`\n[${i + 1}/${SPECIAL_HANDLES.length}] Processing @${xHandle}...`);
    log('-'.repeat(50));

    const result: RefreshResult = {
      handle: xHandle,
      projectId: null,
      found: false,
    };

    try {
      // Step 1: Find the project
      const project = await findProject(supabase, xHandle, slug);

      if (!project) {
        log(`⚠️  Project not found for @${xHandle} (slug: ${slug})`);
        result.error = 'Project not found';
        results.push(result);
        continue;
      }

      result.found = true;
      result.projectId = project.id;
      log(`✅ Found project: ${project.name} (ID: ${project.id})`);

      // Ensure twitter_username is set (needed for API calls)
      if (!project.twitter_username) {
        log(`   Setting twitter_username to @${xHandle}...`);
        await supabase
          .from('projects')
          .update({ twitter_username: xHandle })
          .eq('id', project.id);
        project.twitter_username = xHandle;
      }

      // Step 2: Run sentiment update with deep limits
      log(`\n   📊 Running sentiment update (max tweets: ${DEEP_REFRESH_LIMITS.maxTweets}, max mentions: ${DEEP_REFRESH_LIMITS.maxMentions})...`);
      
      const sentimentOpts: SentimentRunOptions = {
        maxTweets: DEEP_REFRESH_LIMITS.maxTweets,
        maxMentions: DEEP_REFRESH_LIMITS.maxMentions,
      };

      const sentimentResult = await processSentiment(project, today, supabase, sentimentOpts);

      if (sentimentResult) {
        // Upsert metrics
        const { error: metricsError } = await supabase
          .from('metrics_daily')
          .upsert(sentimentResult.metrics, { onConflict: 'project_id,date' });

        if (metricsError) {
          log(`   ⚠️  Failed to save metrics: ${metricsError.message}`);
        } else {
          log(`   ✅ Metrics saved: AKARI=${sentimentResult.metrics.akari_score}, Sentiment=${sentimentResult.metrics.sentiment_score}`);
        }

        // Save tweets
        if (sentimentResult.tweets.length > 0) {
          const { error: tweetsError } = await supabase
            .from('project_tweets')
            .upsert(sentimentResult.tweets, { onConflict: 'project_id,tweet_id' });

          if (tweetsError) {
            log(`   ⚠️  Failed to save tweets: ${tweetsError.message}`);
          } else {
            const officialCount = sentimentResult.tweets.filter(t => t.is_official).length;
            const mentionCount = sentimentResult.tweets.filter(t => !t.is_official).length;
            log(`   ✅ Saved ${sentimentResult.tweets.length} tweets (${officialCount} official, ${mentionCount} mentions)`);
          }
        }

        // Update project profile data
        if (sentimentResult.projectUpdate) {
          await supabase
            .from('projects')
            .update(sentimentResult.projectUpdate)
            .eq('id', project.id);
        }

        result.sentimentResult = {
          tweetsFetched: sentimentResult.tweets.filter(t => t.is_official).length,
          mentionsFetched: sentimentResult.tweets.filter(t => !t.is_official).length,
        };
      }

      // Step 3: Rebuild inner circle with deep limits
      log(`\n   🔮 Rebuilding inner circle (max size: ${DEEP_REFRESH_LIMITS.maxInnerCircleSize})...`);

      const dbProject: DbProject = {
        id: project.id,
        slug: project.slug,
        name: project.name,
        twitter_username: project.twitter_username!,
      };

      const innerCircleOpts: InnerCircleRunOptions = {
        maxFollowersToFetch: DEEP_REFRESH_LIMITS.maxFollowersToFetch,
        maxInnerCircleSize: DEEP_REFRESH_LIMITS.maxInnerCircleSize,
      };

      const icResult = await processInnerCircle(supabase, dbProject, innerCircleOpts);

      result.innerCircleResult = {
        membersSaved: icResult.innerCircleSize,
        totalPower: icResult.innerCirclePower,
      };

      log(`   ✅ Inner circle rebuilt: ${icResult.innerCircleSize} members, power: ${icResult.innerCirclePower}`);

      // Summary for this profile
      log(`\n   📋 Summary for @${xHandle}:`);
      log(`      - Tweets fetched: ${result.sentimentResult?.tweetsFetched ?? 0}`);
      log(`      - Mentions fetched: ${result.sentimentResult?.mentionsFetched ?? 0}`);
      log(`      - Inner circle members: ${result.innerCircleResult.membersSaved}`);

    } catch (error: any) {
      log(`   ❌ Error processing @${xHandle}: ${error.message}`);
      result.error = error.message;
    }

    results.push(result);

    // Rate limiting between profiles
    if (i < SPECIAL_HANDLES.length - 1) {
      log(`\n   ⏳ Waiting ${DELAY_BETWEEN_PROFILES_MS / 1000}s before next profile...`);
      await sleep(DELAY_BETWEEN_PROFILES_MS);
    }
  }

  // Final summary
  log('\n' + '='.repeat(60));
  log('DEEP REFRESH COMPLETE');
  log('='.repeat(60));

  const successful = results.filter(r => r.found && !r.error);
  const notFound = results.filter(r => !r.found);
  const failed = results.filter(r => r.found && r.error);

  log(`Successful: ${successful.length}`);
  log(`Not found: ${notFound.length}`);
  log(`Failed: ${failed.length}`);

  for (const r of results) {
    const status = !r.found ? '❌ NOT FOUND' : r.error ? '⚠️ ERROR' : '✅ SUCCESS';
    log(`  @${r.handle}: ${status}`);
    if (r.sentimentResult) {
      log(`    - Tweets: ${r.sentimentResult.tweetsFetched}, Mentions: ${r.sentimentResult.mentionsFetched}`);
    }
    if (r.innerCircleResult) {
      log(`    - Inner Circle: ${r.innerCircleResult.membersSaved} members`);
    }
    if (r.error) {
      log(`    - Error: ${r.error}`);
    }
  }

  log('='.repeat(60));

  return results;
}

// =============================================================================
// CLI ENTRY POINT
// =============================================================================

if (require.main === module) {
  deepRefreshSpecialProfiles()
    .then((results) => {
      const hasErrors = results.some(r => r.error || !r.found);
      process.exit(hasErrors ? 1 : 0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { deepRefreshSpecialProfiles };

