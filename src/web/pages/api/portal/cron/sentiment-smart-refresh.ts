/**
 * Cron API Route: Smart Sentiment Refresh
 * 
 * Intelligently refreshes projects based on user demand and activity patterns.
 * Runs BEFORE the main sentiment-refresh-all cron to update refresh schedules.
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
 * GET /api/portal/cron/sentiment-smart-refresh?secret=YOUR_CRON_SECRET
 * 
 * =============================================================================
 * VERCEL CRON CONFIGURATION
 * =============================================================================
 * 
 * Add to vercel.json:
 * 
 * {
 *   "path": "/api/portal/cron/sentiment-smart-refresh",
 *   "schedule": "0 7 * * *"
 * }
 * 
 * Runs daily at 07:00 UTC (1 hour before sentiment-refresh-all at 08:00 UTC).
 * 
 * =============================================================================
 * ALGORITHM
 * =============================================================================
 * 
 * For each project with a refresh_state record:
 * 
 * 1. Compute inactivity_days since last interaction (view/search/refresh)
 * 
 * 2. Compute interest_score:
 *    - Manual views: +2 per view
 *    - Searches: +1 per search
 *    - Inactivity penalty: -1 per 5 days inactive
 * 
 * 3. Assign refresh_frequency:
 *    - interest_score >= 5  → 'daily'
 *    - interest_score >= 1  → '3_days'
 *    - interest_score < 1   → 'weekly'
 * 
 * 4. Decide if should refresh today:
 *    - 'daily': always refresh
 *    - '3_days': refresh if >=3 days since last cron refresh
 *    - 'weekly': refresh if >=7 days since last cron refresh
 * 
 * 5. If should refresh:
 *    - Call processProjectById with conservative limits
 *    - Update last_cron_refreshed_at
 *    - Reset inactivity_days
 * 
 * 6. If not refreshing:
 *    - Increment inactivity_days
 * 
 * =============================================================================
 * API BUDGET
 * =============================================================================
 * 
 * Uses { maxTweets: 10, maxMentions: 30 } to protect API budget.
 * Same limits as the existing sentiment-refresh-all cron.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { processProjectById, type Project, type SentimentRunOptions } from '@/lib/server/sentiment/processProject';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Rate limiting
const DELAY_BETWEEN_PROJECTS_MS = 2000;

// API budget protection
const DEFAULT_MAX_TWEETS = 10;
const DEFAULT_MAX_MENTIONS = 30;

// Interest score thresholds
const DAILY_THRESHOLD = 5;
const THREE_DAYS_THRESHOLD = 1;

// Inactivity penalty: -1 point per this many days
const INACTIVITY_PENALTY_DAYS = 5;

// =============================================================================
// TYPES
// =============================================================================

type RefreshFrequency = 'daily' | '3_days' | 'weekly';

interface ProjectRefreshState {
  project_id: string;
  last_manual_view_at: string | null;
  last_searched_at: string | null;
  last_cron_refreshed_at: string | null;
  inactivity_days: number;
  interest_score: number;
  refresh_frequency: RefreshFrequency;
}

interface ProjectWithRefreshState {
  id: string;
  slug: string;
  name: string;
  twitter_username: string | null;
  is_active: boolean;
  refreshState: ProjectRefreshState | null;
}

interface ProcessResult {
  projectId: string;
  slug: string;
  refreshed: boolean;
  reason: string;
  newFrequency?: RefreshFrequency;
  newInterestScore?: number;
}

interface CronResponse {
  ok: boolean;
  message: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalProjects: number;
  refreshedCount: number;
  skippedCount: number;
  results: ProcessResult[];
  errors?: string[];
}

// =============================================================================
// HELPERS
// =============================================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSupabaseClient(): SupabaseClient {
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

  if (!cronSecret) {
    console.warn('[SmartRefresh] CRON_SECRET not configured in environment');
    return false;
  }

  // Extract authorization header - Vercel sends "Bearer <CRON_SECRET>"
  const authHeader = req.headers.authorization;
  const authSecret = authHeader?.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : authHeader;

  const providedSecret =
    authSecret ||
    (req.headers['x-cron-secret'] as string | undefined) ||
    (req.query.secret as string | undefined) ||
    (req.query.token as string | undefined);

  // Debug logging
  console.log(`[SmartRefresh] Auth check: authHeader=${!!authHeader}, x-cron-secret=${!!req.headers['x-cron-secret']}, queryParam=${!!(req.query.secret || req.query.token)}`);
  
  if (!providedSecret) {
    console.warn('[SmartRefresh] No secret provided in request');
    return false;
  }
  
  const isValid = providedSecret === cronSecret;
  if (!isValid) {
    console.warn(`[SmartRefresh] Secret mismatch - provided length: ${providedSecret.length}, expected length: ${cronSecret.length}`);
  }
  
  return isValid;
}

/**
 * Calculate days since a timestamp
 */
function daysSince(timestamp: string | null): number {
  if (!timestamp) return Infinity;
  const then = new Date(timestamp).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

/**
 * Get the most recent interaction timestamp
 */
function getMostRecentInteraction(state: ProjectRefreshState | null): string | null {
  if (!state) return null;
  
  const timestamps = [
    state.last_manual_view_at,
    state.last_searched_at,
    state.last_cron_refreshed_at,
  ].filter(Boolean) as string[];

  if (timestamps.length === 0) return null;
  
  return timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

/**
 * Compute new interest score with inactivity penalty
 */
function computeInterestScore(
  currentScore: number,
  inactivityDays: number
): number {
  // Apply inactivity penalty: -1 per INACTIVITY_PENALTY_DAYS days
  const penalty = Math.floor(inactivityDays / INACTIVITY_PENALTY_DAYS);
  const newScore = currentScore - penalty;
  
  // Don't go below 0
  return Math.max(0, newScore);
}

/**
 * Determine refresh frequency based on interest score
 */
function determineRefreshFrequency(interestScore: number): RefreshFrequency {
  if (interestScore >= DAILY_THRESHOLD) return 'daily';
  if (interestScore >= THREE_DAYS_THRESHOLD) return '3_days';
  return 'weekly';
}

/**
 * Determine if project should refresh today
 */
function shouldRefreshToday(
  frequency: RefreshFrequency,
  daysSinceLastCronRefresh: number
): { shouldRefresh: boolean; reason: string } {
  switch (frequency) {
    case 'daily':
      return { shouldRefresh: true, reason: 'daily refresh schedule' };
    
    case '3_days':
      if (daysSinceLastCronRefresh >= 3) {
        return { shouldRefresh: true, reason: '3-day schedule due' };
      }
      return { shouldRefresh: false, reason: `3-day schedule: ${3 - daysSinceLastCronRefresh} days until next refresh` };
    
    case 'weekly':
      if (daysSinceLastCronRefresh >= 7) {
        return { shouldRefresh: true, reason: 'weekly schedule due' };
      }
      return { shouldRefresh: false, reason: `weekly schedule: ${7 - daysSinceLastCronRefresh} days until next refresh` };
    
    default:
      return { shouldRefresh: true, reason: 'unknown frequency, defaulting to refresh' };
  }
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
    console.warn('[SmartRefresh] Unauthorized request');
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  console.log('='.repeat(60));
  console.log('[SmartRefresh] Starting smart sentiment refresh');
  console.log('[SmartRefresh] Time:', startedAt.toISOString());
  console.log('='.repeat(60));

  const results: ProcessResult[] = [];
  const errors: string[] = [];
  let refreshedCount = 0;
  let skippedCount = 0;

  try {
    const supabase = getSupabaseClient();

    // Fetch all active projects with their refresh state
    console.log('[SmartRefresh] Fetching active projects with refresh state...');
    
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, slug, name, twitter_username, is_active')
      .eq('is_active', true)
      .not('twitter_username', 'is', null)
      .order('name');

    if (projectsError) {
      throw new Error(`Failed to fetch projects: ${projectsError.message}`);
    }

    const validProjects = (projects || []).filter(
      (p) => p.twitter_username && p.twitter_username.trim() !== ''
    );

    console.log(`[SmartRefresh] Found ${validProjects.length} active projects`);

    if (validProjects.length === 0) {
      const completedAt = new Date();
      return res.status(200).json({
        ok: true,
        message: 'No active projects to process',
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        totalProjects: 0,
        refreshedCount: 0,
        skippedCount: 0,
        results: [],
      });
    }

    // Fetch refresh states for all projects
    const projectIds = validProjects.map((p) => p.id);
    const { data: refreshStates, error: statesError } = await supabase
      .from('project_refresh_state')
      .select('*')
      .in('project_id', projectIds);

    if (statesError) {
      console.error('[SmartRefresh] Failed to fetch refresh states:', statesError);
    }

    // Create a map for quick lookup
    const stateMap = new Map<string, ProjectRefreshState>();
    if (refreshStates) {
      for (const state of refreshStates) {
        stateMap.set(state.project_id, state);
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const options: SentimentRunOptions = {
      maxTweets: DEFAULT_MAX_TWEETS,
      maxMentions: DEFAULT_MAX_MENTIONS,
    };

    // Process each project
    for (let i = 0; i < validProjects.length; i++) {
      const project = validProjects[i];
      const projectNum = i + 1;
      const state = stateMap.get(project.id) || null;

      console.log(`\n[${projectNum}/${validProjects.length}] Processing: ${project.name} (@${project.twitter_username})`);

      try {
        // Calculate metrics
        const mostRecentInteraction = getMostRecentInteraction(state);
        const daysSinceInteraction = daysSince(mostRecentInteraction);
        const daysSinceLastCronRefresh = daysSince(state?.last_cron_refreshed_at || null);

        // Compute new interest score with inactivity penalty
        const currentInterestScore = state?.interest_score ?? 0;
        const newInterestScore = computeInterestScore(currentInterestScore, daysSinceInteraction);

        // Determine refresh frequency
        const newFrequency = determineRefreshFrequency(newInterestScore);

        // Check if should refresh today
        const { shouldRefresh, reason } = shouldRefreshToday(newFrequency, daysSinceLastCronRefresh);

        console.log(`[${projectNum}]   Interest: ${currentInterestScore}→${newInterestScore}, Frequency: ${newFrequency}, Days since refresh: ${daysSinceLastCronRefresh}`);
        console.log(`[${projectNum}]   Decision: ${shouldRefresh ? '✓ REFRESH' : '✗ SKIP'} - ${reason}`);

        if (shouldRefresh) {
          // Build project object for processProjectById
          const projectData: Project = {
            id: project.id,
            slug: project.slug,
            twitter_username: project.twitter_username,
            name: project.name,
            is_active: project.is_active ?? true,
          };

          // Process the project
          const result = await processProjectById(projectData, today, supabase, options);

          if (result) {
            // Upsert metrics_daily with updated_at
            const metricsWithTimestamp = {
              ...result.metrics,
              updated_at: new Date().toISOString(),
            };

            const { error: metricsError } = await supabase
              .from('metrics_daily')
              .upsert(metricsWithTimestamp, { onConflict: 'project_id,date' });

            if (metricsError) {
              console.error(`[${projectNum}] ⚠️ Failed to save metrics:`, metricsError.message);
            }

            // Update project profile
            const { error: updateError } = await supabase
              .from('projects')
              .update(result.projectUpdate)
              .eq('id', project.id);

            if (updateError) {
              console.error(`[${projectNum}] ⚠️ Failed to update project:`, updateError.message);
            }

            // Save tweets
            if (result.tweets.length > 0) {
              const { error: tweetsError } = await supabase
                .from('project_tweets')
                .upsert(result.tweets, { onConflict: 'project_id,tweet_id' });

              if (tweetsError) {
                console.error(`[${projectNum}] ⚠️ Failed to save tweets:`, tweetsError.message);
              }
            }

            console.log(`[${projectNum}] ✅ Refreshed: AKARI=${result.metrics.akari_score}, Sentiment=${result.metrics.sentiment_score}`);

            // Update refresh state
            await supabase
              .from('project_refresh_state')
              .upsert({
                project_id: project.id,
                last_cron_refreshed_at: new Date().toISOString(),
                inactivity_days: 0,
                interest_score: newInterestScore,
                refresh_frequency: newFrequency,
              }, { onConflict: 'project_id' });

            refreshedCount++;
            results.push({
              projectId: project.id,
              slug: project.slug,
              refreshed: true,
              reason,
              newFrequency,
              newInterestScore,
            });
          } else {
            console.log(`[${projectNum}] ⚠️ No result from processProjectById`);
            skippedCount++;
            results.push({
              projectId: project.id,
              slug: project.slug,
              refreshed: false,
              reason: 'processProjectById returned null',
              newFrequency,
              newInterestScore,
            });
          }
        } else {
          // Update state without refreshing
          const newInactivityDays = (state?.inactivity_days ?? 0) + 1;
          
          await supabase
            .from('project_refresh_state')
            .upsert({
              project_id: project.id,
              inactivity_days: newInactivityDays,
              interest_score: newInterestScore,
              refresh_frequency: newFrequency,
            }, { onConflict: 'project_id' });

          skippedCount++;
          results.push({
            projectId: project.id,
            slug: project.slug,
            refreshed: false,
            reason,
            newFrequency,
            newInterestScore,
          });
        }
      } catch (projectError: any) {
        console.error(`[${projectNum}] ❌ Error:`, projectError.message);
        errors.push(`${project.slug}: ${projectError.message}`);
        skippedCount++;
        results.push({
          projectId: project.id,
          slug: project.slug,
          refreshed: false,
          reason: `Error: ${projectError.message}`,
        });
      }

      // Rate limiting
      if (i < validProjects.length - 1) {
        await delay(DELAY_BETWEEN_PROJECTS_MS);
      }
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    console.log('\n' + '='.repeat(60));
    console.log('[SmartRefresh] COMPLETED');
    console.log(`[SmartRefresh] Duration: ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`[SmartRefresh] Refreshed: ${refreshedCount} | Skipped: ${skippedCount}`);
    console.log('='.repeat(60));

    return res.status(200).json({
      ok: true,
      message: `Smart refresh complete: ${refreshedCount} refreshed, ${skippedCount} skipped`,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs,
      totalProjects: validProjects.length,
      refreshedCount,
      skippedCount,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[SmartRefresh] Fatal error:', error);

    const completedAt = new Date();

    return res.status(500).json({
      ok: false,
      message: `Cron failed: ${error.message}`,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      totalProjects: 0,
      refreshedCount,
      skippedCount,
      results,
      errors: [error.message, ...errors],
    });
  }
}

