/**
 * Shared Project Refresh Helper
 * 
 * Provides a reusable function to refresh sentiment, metrics, inner circle, and topic stats
 * for a single project. This reuses the same logic from the cron jobs but scoped to one project.
 * 
 * Used by:
 * - Admin manual refresh endpoint: /api/portal/admin/projects/[id]/refresh
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { processProjectById, type Project, type ProcessingResult } from './processProject';
import { processInnerCircleById, type InnerCircleProject } from './processInnerCircle';
import { recomputeProjectTopicStats } from '../../../../server/sentiment/topics';
import { SENTIMENT_CONFIG } from '../../../../server/config/sentiment.config';

// =============================================================================
// TYPES
// =============================================================================

export interface RefreshResult {
  ok: true;
  projectId: string;
  refreshedAt: string;
  details: {
    sentimentUpdated: boolean;
    innerCircleUpdated: boolean;
    topicStatsUpdated: boolean;
    metrics?: {
      akariScore: number;
      sentimentScore: number;
      ctHeatScore: number;
      tweetCount: number;
      followers: number;
    };
    innerCircle?: {
      members: number;
      power: number;
    };
  };
}

export interface RefreshError {
  ok: false;
  error: string;
  code?: 'PROJECT_NOT_FOUND' | 'NO_TWITTER_USERNAME' | 'PROCESSING_ERROR';
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Rate limiting (small delay between API calls)
const DELAY_BETWEEN_API_CALLS_MS = 500;

// =============================================================================
// UTILITIES
// =============================================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSupabaseClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Refresh a single project's sentiment, metrics, inner circle, and topic stats.
 * 
 * This function:
 * 1. Validates that the project exists and has a twitter_username
 * 2. Fetches fresh Twitter data (tweets, mentions, profile) using processProjectById
 * 3. Recalculates sentiment, CT heat, and AKARI scores
 * 4. Updates metrics_daily for today
 * 5. Recomputes and persists inner circle for the project
 * 6. Recomputes and persists topic stats for the project
 * 
 * @param projectId - The project ID to refresh
 * @param options - Optional configuration for the refresh
 * @returns RefreshResult on success, RefreshError on failure
 */
export async function refreshProjectById(
  projectId: string,
  options: {
    maxTweets?: number;
    maxMentions?: number;
    maxFollowersToFetch?: number;
    maxInnerCircleSize?: number;
    skipInnerCircle?: boolean;
    skipTopicStats?: boolean;
  } = {}
): Promise<RefreshResult | RefreshError> {
  try {
    // Validate environment
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return {
        ok: false,
        error: 'Missing Supabase configuration',
        code: 'PROCESSING_ERROR',
      };
    }

    const supabase = getSupabaseClient();

    // Step 1: Fetch and validate project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, slug, name, twitter_username, is_active')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return {
        ok: false,
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND',
      };
    }

    // Validate twitter_username
    if (!project.twitter_username || !project.twitter_username.trim()) {
      return {
        ok: false,
        error: 'Project does not have a Twitter username configured',
        code: 'NO_TWITTER_USERNAME',
      };
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Step 2: Process sentiment and metrics using the existing web-local helper
    console.log(`[Project Refresh] Processing sentiment for project ${project.name} (@${project.twitter_username})`);
    
    const sentimentProject: Project = {
      id: project.id,
      slug: project.slug,
      twitter_username: project.twitter_username,
      name: project.name,
      is_active: project.is_active ?? true,
    };

    const sentimentResult = await processProjectById(
      sentimentProject,
      today,
      supabase,
      {
        maxTweets: options.maxTweets,
        maxMentions: options.maxMentions,
      }
    );

    let sentimentUpdated = false;
    let metrics: RefreshResult['details']['metrics'] | undefined;

    if (sentimentResult) {
      // Upsert metrics to Supabase
      const metricsWithTimestamp = {
        ...sentimentResult.metrics,
        updated_at: new Date().toISOString(),
      };
      const { error: upsertError } = await supabase
        .from('metrics_daily')
        .upsert(metricsWithTimestamp, {
          onConflict: 'project_id,date',
        });

      if (upsertError) {
        console.error(`[Project Refresh] Failed to save metrics:`, upsertError.message);
        // Continue anyway - partial success
      } else {
        sentimentUpdated = true;
        metrics = {
          akariScore: sentimentResult.metrics.akari_score,
          sentimentScore: sentimentResult.metrics.sentiment_score,
          ctHeatScore: sentimentResult.metrics.ct_heat_score,
          tweetCount: sentimentResult.metrics.tweet_count,
          followers: sentimentResult.metrics.followers,
        };

        // Update project with profile data (avatar, bio, etc.)
        const { error: updateError } = await supabase
          .from('projects')
          .update(sentimentResult.projectUpdate)
          .eq('id', project.id);

        if (updateError) {
          console.error(`[Project Refresh] Failed to update project profile:`, updateError.message);
        }

        // Save tweets to project_tweets table
        if (sentimentResult.tweets.length > 0) {
          const { error: tweetsError } = await supabase
            .from('project_tweets')
            .upsert(sentimentResult.tweets, {
              onConflict: 'project_id,tweet_id',
            });

          if (tweetsError) {
            console.error(`[Project Refresh] Failed to save tweets:`, tweetsError.message);
          } else {
            // IMPORTANT: After saving tweets, save profiles for mention authors
            // This ensures auto-tracked creators have profiles with avatars for ARC leaderboards
            try {
              const { saveMentionProfiles } = await import('@/lib/portal/save-mention-profiles');
              const profileStats = await saveMentionProfiles(supabase, project.id);
              if (profileStats.profilesCreated > 0 || profileStats.profilesUpdated > 0) {
                console.log(`[Project Refresh] ✅ Saved ${profileStats.profilesCreated + profileStats.profilesUpdated} profiles for mention authors`);
              }
            } catch (profileError: any) {
              console.warn(`[Project Refresh] ⚠️ Failed to save mention profiles:`, profileError?.message);
              // Non-critical, continue anyway
            }
          }
        }
      }
    }

    await delay(DELAY_BETWEEN_API_CALLS_MS);

    // Step 3: Process inner circle (if not skipped)
    let innerCircleUpdated = false;
    let innerCircle: RefreshResult['details']['innerCircle'] | undefined;

    if (!options.skipInnerCircle && project.twitter_username) {
      console.log(`[Project Refresh] Processing inner circle for ${project.name}`);
      try {
        const icProject: InnerCircleProject = {
          id: project.id,
          slug: project.slug,
          name: project.name,
          twitter_username: project.twitter_username,
        };

        const icResult = await processInnerCircleById(supabase, icProject, {
          maxFollowersToFetch: options.maxFollowersToFetch,
          maxInnerCircleSize: options.maxInnerCircleSize,
        });

        innerCircleUpdated = icResult.innerCircleSize > 0;
        innerCircle = {
          members: icResult.innerCircleSize,
          power: icResult.innerCirclePower,
        };
      } catch (icError: any) {
        console.error(`[Project Refresh] Failed to process inner circle:`, icError.message);
        // Continue anyway - partial success
      }
    }

    await delay(DELAY_BETWEEN_API_CALLS_MS);

    // Step 4: Recompute topic stats (if not skipped)
    let topicStatsUpdated = false;

    if (!options.skipTopicStats) {
      console.log(`[Project Refresh] Computing topic stats for project ${project.name}`);
      try {
        await recomputeProjectTopicStats(supabase, project.id, '30d');
        topicStatsUpdated = true;
      } catch (topicError: any) {
        console.error(`[Project Refresh] Failed to compute topic stats:`, topicError.message);
        // Continue anyway - partial success
      }
    }

    const refreshedAt = new Date().toISOString();

    return {
      ok: true,
      projectId: project.id,
      refreshedAt,
      details: {
        sentimentUpdated,
        innerCircleUpdated,
        topicStatsUpdated,
        metrics,
        innerCircle,
      },
    };
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`[Project Refresh] Error refreshing project ${projectId}:`, err);
    return {
      ok: false,
      error: err.message || 'Unknown error occurred',
      code: 'PROCESSING_ERROR',
    };
  }
}

