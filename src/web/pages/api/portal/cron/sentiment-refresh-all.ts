/**
 * Cron API Route: Sentiment Refresh All Projects
 * 
 * Runs a FULL sentiment refresh for all active tracked projects.
 * This fetches real Twitter data from twitterapi.io, analyzes sentiment,
 * and updates metrics_daily with fresh data.
 * 
 * Unlike /api/cron/sentiment-update (which only touches timestamps),
 * this endpoint actually pulls new tweets and recalculates all scores.
 * 
 * =============================================================================
 * SECURITY
 * =============================================================================
 * 
 * Requires CRON_SECRET authentication via one of:
 * - Query param: ?secret=CRON_SECRET
 * - Header: Authorization: Bearer CRON_SECRET
 * - Header: x-cron-secret: CRON_SECRET
 * 
 * =============================================================================
 * MANUAL INVOCATION
 * =============================================================================
 * 
 * GET /api/portal/cron/sentiment-refresh-all?secret=YOUR_CRON_SECRET
 * 
 * Example:
 *   curl "https://yourdomain.com/api/portal/cron/sentiment-refresh-all?secret=abc123"
 * 
 * =============================================================================
 * VERCEL CRON CONFIGURATION
 * =============================================================================
 * 
 * Add to vercel.json:
 * 
 * {
 *   "crons": [
 *     {
 *       "path": "/api/portal/cron/sentiment-refresh-all?secret=YOUR_CRON_SECRET",
 *       "schedule": "0 8 * * *"
 *     }
 *   ]
 * }
 * 
 * This runs daily at 08:00 UTC.
 * 
 * =============================================================================
 * BEHAVIOR
 * =============================================================================
 * 
 * For each active project with a twitter_username:
 * 1. Fetches profile, tweets (max 10), mentions, followers from Twitter API
 * 2. Calculates sentiment, CT Heat, and AKARI scores
 * 3. Upserts metrics_daily with updated_at timestamp
 * 4. Updates projects.last_refreshed_at
 * 5. Upserts project_tweets
 * 
 * Rate limiting: 2 second delay between projects to avoid API throttling.
 * 
 * =============================================================================
 * API BUDGET PROTECTION
 * =============================================================================
 * 
 * Uses maxTweets: 10 to limit Twitter API calls per project.
 * With 50 projects, this means ~50 API calls for tweets (plus profile/mentions).
 * 
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { processProjectById, type Project, type SentimentRunOptions } from '@/lib/server/sentiment/processProject';
import { SENTIMENT_CONFIG } from '../../../../../server/config/sentiment.config';

// =============================================================================
// CONFIGURATION (from centralized config)
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Rate limiting and limits from centralized config
const DELAY_BETWEEN_PROJECTS_MS = SENTIMENT_CONFIG.cron.delayBetweenProjectsMs;
const DEFAULT_MAX_TWEETS = SENTIMENT_CONFIG.cron.maxTweets;
const DEFAULT_MAX_MENTIONS = SENTIMENT_CONFIG.cron.maxMentions;

// =============================================================================
// TYPES
// =============================================================================

interface ProjectRefreshResult {
  projectId: string;
  slug: string;
  success: boolean;
  tweetsCollected: number;
  mentionsCollected: number;
  error?: string;
}

interface CronResponse {
  ok: boolean;
  message: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalProjects: number;
  successCount: number;
  failCount: number;
  results: ProjectRefreshResult[];
  errors?: string[];
}

// =============================================================================
// HELPERS
// =============================================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function validateCronSecret(req: NextApiRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  
  // If no CRON_SECRET is configured, reject all requests
  if (!cronSecret) {
    console.warn('[SentimentRefreshAll] CRON_SECRET not configured in environment');
    return false;
  }

  // Extract authorization header - Vercel sends "Bearer <CRON_SECRET>"
  const authHeader = req.headers.authorization;
  const authSecret = authHeader?.startsWith('Bearer ') 
    ? authHeader.slice(7) // More reliable than replace()
    : authHeader;
  
  // Check multiple auth methods (in order of preference)
  const providedSecret =
    authSecret ||
    (req.headers['x-cron-secret'] as string | undefined) ||
    (req.query.secret as string | undefined) ||
    (req.query.token as string | undefined);

  // Debug logging - helps diagnose auth issues in Vercel logs
  const hasAuth = !!authHeader;
  const hasXCronSecret = !!req.headers['x-cron-secret'];
  const hasQuerySecret = !!(req.query.secret || req.query.token);
  
  console.log(`[SentimentRefreshAll] Auth check: authHeader=${hasAuth}, x-cron-secret=${hasXCronSecret}, queryParam=${hasQuerySecret}`);
  
  if (!providedSecret) {
    console.warn('[SentimentRefreshAll] No secret provided in request');
    return false;
  }
  
  const isValid = providedSecret === cronSecret;
  if (!isValid) {
    console.warn(`[SentimentRefreshAll] Secret mismatch - provided length: ${providedSecret.length}, expected length: ${cronSecret.length}`);
  }
  
  return isValid;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CronResponse | { ok: false; error: string }>
) {
  const startedAt = new Date();

  // Only allow GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Validate CRON_SECRET
  if (!validateCronSecret(req)) {
    console.warn('[SentimentRefreshAll] Unauthorized request');
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  console.log('='.repeat(60));
  console.log('[SentimentRefreshAll] Starting full sentiment refresh');
  console.log('[SentimentRefreshAll] Time:', startedAt.toISOString());
  console.log('='.repeat(60));

  const results: ProjectRefreshResult[] = [];
  const errors: string[] = [];
  let successCount = 0;
  let failCount = 0;

  try {
    // Get Supabase client
    const supabase = getSupabaseClient();

    // Fetch all active projects with twitter_username
    console.log('[SentimentRefreshAll] Fetching active projects...');
    const { data: projects, error: fetchError } = await supabase
      .from('projects')
      .select('id, slug, name, twitter_username, is_active')
      .eq('is_active', true)
      .not('twitter_username', 'is', null)
      .order('name');

    if (fetchError) {
      console.error('[SentimentRefreshAll] Failed to fetch projects:', fetchError);
      throw new Error(`Failed to fetch projects: ${fetchError.message}`);
    }

    // Filter to only projects with valid twitter_username
    const validProjects = (projects || []).filter(
      (p) => p.twitter_username && p.twitter_username.trim() !== ''
    );

    console.log(`[SentimentRefreshAll] Found ${validProjects.length} active projects with twitter_username`);

    if (validProjects.length === 0) {
      const completedAt = new Date();
      return res.status(200).json({
        ok: true,
        message: 'No active projects to refresh',
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        totalProjects: 0,
        successCount: 0,
        failCount: 0,
        results: [],
      });
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Process options - protect API budget
    const options: SentimentRunOptions = {
      maxTweets: DEFAULT_MAX_TWEETS,
      maxMentions: DEFAULT_MAX_MENTIONS,
    };

    // Process each project
    for (let i = 0; i < validProjects.length; i++) {
      const project = validProjects[i];
      const projectNum = i + 1;

      console.log(`\n[${projectNum}/${validProjects.length}] Processing: ${project.name} (@${project.twitter_username})`);

      const projectResult: ProjectRefreshResult = {
        projectId: project.id,
        slug: project.slug,
        success: false,
        tweetsCollected: 0,
        mentionsCollected: 0,
      };

      try {
        // Build project object for processProjectById
        const projectData: Project = {
          id: project.id,
          slug: project.slug,
          twitter_username: project.twitter_username,
          name: project.name,
          is_active: project.is_active ?? true,
        };

        // Process the project - this fetches Twitter data and computes scores
        const result = await processProjectById(projectData, today, supabase, options);

        if (result) {
          // Upsert metrics_daily with updated_at timestamp
          const metricsWithTimestamp = {
            ...result.metrics,
            updated_at: new Date().toISOString(),
          };

          const { error: metricsError } = await supabase
            .from('metrics_daily')
            .upsert(metricsWithTimestamp, {
              onConflict: 'project_id,date',
            });

          if (metricsError) {
            console.error(`[${projectNum}] Failed to save metrics:`, metricsError.message);
            projectResult.error = `Metrics save failed: ${metricsError.message}`;
          } else {
            console.log(`[${projectNum}] ✅ Metrics saved`);
            console.log(`[${projectNum}]    AKARI: ${result.metrics.akari_score} | Sentiment: ${result.metrics.sentiment_score} | CT Heat: ${result.metrics.ct_heat_score}`);

            // Update project with profile data (avatar, bio, last_refreshed_at)
            const { error: updateError } = await supabase
              .from('projects')
              .update(result.projectUpdate)
              .eq('id', project.id);

            if (updateError) {
              console.error(`[${projectNum}] ⚠️ Failed to update project:`, updateError.message);
            } else {
              console.log(`[${projectNum}] ✅ Project updated (last_refreshed_at set)`);
            }

            // Save tweets to project_tweets table
            if (result.tweets.length > 0) {
              const { error: tweetsError } = await supabase
                .from('project_tweets')
                .upsert(result.tweets, {
                  onConflict: 'project_id,tweet_id',
                });

              if (tweetsError) {
                console.error(`[${projectNum}] ⚠️ Failed to save tweets:`, tweetsError.message);
              } else {
                console.log(`[${projectNum}] ✅ Saved ${result.tweets.length} tweets`);
              }
            }

            // Count tweets vs mentions from the result
            const officialTweets = result.tweets.filter((t) => t.is_official).length;
            const mentionTweets = result.tweets.filter((t) => !t.is_official).length;

            projectResult.success = true;
            projectResult.tweetsCollected = officialTweets;
            projectResult.mentionsCollected = mentionTweets;
            successCount++;
          }
        } else {
          console.log(`[${projectNum}] ⚠️ No result returned (API may have failed)`);
          projectResult.error = 'No result returned from processProjectById';
          failCount++;
        }
      } catch (projectError: any) {
        console.error(`[${projectNum}] ❌ Error:`, projectError.message);
        projectResult.error = projectError.message;
        errors.push(`${project.slug}: ${projectError.message}`);
        failCount++;
      }

      results.push(projectResult);

      // Rate limiting delay between projects (except for last one)
      if (i < validProjects.length - 1) {
        console.log(`[${projectNum}] Waiting ${DELAY_BETWEEN_PROJECTS_MS}ms before next project...`);
        await delay(DELAY_BETWEEN_PROJECTS_MS);
      }
    }

    // Completed successfully
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    console.log('\n' + '='.repeat(60));
    console.log('[SentimentRefreshAll] COMPLETED');
    console.log(`[SentimentRefreshAll] Duration: ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`[SentimentRefreshAll] Success: ${successCount} | Failed: ${failCount}`);
    console.log('='.repeat(60));

    return res.status(200).json({
      ok: true,
      message: `Refreshed ${successCount}/${validProjects.length} projects`,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs,
      totalProjects: validProjects.length,
      successCount,
      failCount,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[SentimentRefreshAll] Fatal error:', error);

    const completedAt = new Date();

    return res.status(500).json({
      ok: false,
      message: `Cron failed: ${error.message}`,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      totalProjects: 0,
      successCount,
      failCount,
      results,
      errors: [error.message, ...errors],
    });
  }
}

