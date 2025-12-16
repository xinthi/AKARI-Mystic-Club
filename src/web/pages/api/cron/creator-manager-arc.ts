/**
 * Cron API Route: Creator Manager ARC Scoring
 * 
 * Runs ARC scoring for Creator Manager programs.
 * 
 * This job:
 * 1. Finds all active Creator Manager programs
 * 2. For each program, finds creators with mission progress that has post_tweet_id
 * 3. Fetches engagement metrics for those posts
 * 4. Calculates ARC points using existing scoring formula
 * 5. Updates creator_manager_creators.arc_points
 * 
 * Security: Requires CRON_SECRET via x-akari-cron-secret header (or allows dev mode).
 * 
 * Usage: GET or POST /api/cron/creator-manager-arc
 * Schedule: Can be configured in vercel.json (e.g., hourly or daily)
 * 
 * TODO: Integrate with X API and engagement fetching
 * TODO: Connect to sentiment analysis system
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  calculateArcPointsForCreatorManager,
  addArcPointsForCreatorManager,
  type EngagementMetrics,
  type ContentType,
} from '@/lib/arc/creator-manager-scoring';

// =============================================================================
// TYPES
// =============================================================================

interface CronResponse {
  ok: boolean;
  processedPrograms?: number;
  processedCreators?: number;
  processedPosts?: number;
  pointsAwarded?: number;
  error?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * TODO: Fetch engagement metrics from X API or project_tweets
 * 
 * For now, this is a placeholder that returns null.
 * When implemented, this should:
 * 1. Check project_tweets table for existing engagement data
 * 2. If not found, fetch from X API using existing Twitter client
 * 3. Return EngagementMetrics or null
 */
async function fetchEngagementForTweet(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tweetId: string
): Promise<EngagementMetrics | null> {
  // TODO: Check project_tweets table first
  const { data: tweet } = await supabase
    .from('project_tweets')
    .select('likes, retweets, replies')
    .eq('tweet_id', tweetId)
    .single();

  if (tweet) {
    return {
      likes: tweet.likes || 0,
      retweets: tweet.retweets || 0,
      quotes: 0, // TODO: Add quotes to project_tweets if available
      replies: tweet.replies || 0,
    };
  }

  // TODO: Fetch from X API if not in project_tweets
  console.log(`[Creator Manager ARC Cron] TODO: Fetch engagement from X API for tweet ${tweetId}`);
  return null;
}

/**
 * TODO: Classify content type and sentiment
 * 
 * For now, returns default values.
 * When implemented, should use:
 * - Existing sentiment analysis
 * - Content type detection
 * - project_tweets classification
 */
async function classifyPost(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tweetId: string,
  text?: string
): Promise<{
  contentType: ContentType;
  sentiment: 'positive' | 'neutral' | 'negative';
}> {
  // TODO: Check project_tweets for existing classification
  // TODO: Use sentiment analysis
  // TODO: Detect content type (thread, deep_dive, meme, etc.)
  
  console.log(`[Creator Manager ARC Cron] TODO: Classify post ${tweetId}`);
  return {
    contentType: 'other',
    sentiment: 'neutral',
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CronResponse>
) {
  // Allow GET or POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const isDevMode = process.env.NODE_ENV === 'development';
    const cronSecret = process.env.CRON_SECRET;

    // In dev mode, allow without secret
    if (!isDevMode) {
      if (!cronSecret) {
        console.error('[CRON/creator-manager-arc] CRON_SECRET not configured');
        return res.status(500).json({
          ok: false,
          error: 'CRON_SECRET not configured',
        });
      }

      // Check x-akari-cron-secret header
      const providedSecret = req.headers['x-akari-cron-secret'] as string | undefined;

      if (!providedSecret || providedSecret !== cronSecret) {
        console.warn('[CRON/creator-manager-arc] Unauthorized - secret mismatch or missing');
        return res.status(401).json({
          ok: false,
          error: 'unauthorized',
        });
      }
    }

    console.log('[CRON/creator-manager-arc] Starting Creator Manager ARC scoring job...');

    const supabase = getSupabaseAdmin();

    // 1. Get all active Creator Manager programs
    const { data: programs, error: programsError } = await supabase
      .from('creator_manager_programs')
      .select('id')
      .eq('status', 'active');

    if (programsError) {
      console.error('[CRON/creator-manager-arc] Error loading programs:', programsError);
      throw new Error(`Failed to load programs: ${programsError.message}`);
    }

    if (!programs || programs.length === 0) {
      console.log('[CRON/creator-manager-arc] No active Creator Manager programs found');
      return res.status(200).json({
        ok: true,
        processedPrograms: 0,
        processedCreators: 0,
        processedPosts: 0,
        pointsAwarded: 0,
      });
    }

    console.log(`[CRON/creator-manager-arc] Found ${programs.length} active program(s)`);

    let processedPrograms = 0;
    let processedCreators = 0;
    let processedPosts = 0;
    let totalPointsAwarded = 0;

    // 2. For each program, find mission progress with post_tweet_id
    for (const program of programs) {
      try {
        // Get mission progress entries that have post_tweet_id and are approved/submitted
        const { data: missionProgress, error: progressError } = await supabase
          .from('creator_manager_mission_progress')
          .select('id, mission_id, creator_profile_id, post_tweet_id, post_url, status')
          .eq('program_id', program.id)
          .not('post_tweet_id', 'is', null)
          .in('status', ['submitted', 'approved']);

        if (progressError) {
          console.error(`[CRON/creator-manager-arc] Error loading mission progress for program ${program.id}:`, progressError);
          continue;
        }

        if (!missionProgress || missionProgress.length === 0) {
          continue;
        }

        console.log(`[CRON/creator-manager-arc] Processing ${missionProgress.length} post(s) for program ${program.id}`);

        // 3. For each post, fetch engagement and score
        for (const progress of missionProgress) {
          if (!progress.post_tweet_id) continue;

          try {
            // Fetch engagement metrics
            const engagement = await fetchEngagementForTweet(supabase, progress.post_tweet_id);

            if (!engagement) {
              console.log(`[CRON/creator-manager-arc] Could not fetch engagement for tweet ${progress.post_tweet_id}`);
              continue;
            }

            // Classify post
            const classification = await classifyPost(supabase, progress.post_tweet_id);

            // Calculate ARC points
            const pointsToAdd = calculateArcPointsForCreatorManager({
              contentType: classification.contentType,
              sentiment: classification.sentiment,
              engagement,
              tweetId: progress.post_tweet_id,
            });

            if (pointsToAdd > 0) {
              // Add points to creator
              const result = await addArcPointsForCreatorManager(
                program.id,
                progress.creator_profile_id,
                pointsToAdd
              );

              if (result.success) {
                totalPointsAwarded += pointsToAdd;
                processedPosts++;
                console.log(
                  `[CRON/creator-manager-arc] Awarded ${pointsToAdd} ARC points to creator ${progress.creator_profile_id} ` +
                  `for tweet ${progress.post_tweet_id}`
                );
              }
            }
          } catch (error: any) {
            console.error(
              `[CRON/creator-manager-arc] Error processing post ${progress.post_tweet_id}:`,
              error
            );
            // Continue with next post
          }
        }

        processedPrograms++;
      } catch (error: any) {
        console.error(`[CRON/creator-manager-arc] Error processing program ${program.id}:`, error);
        // Continue with next program
      }
    }

    console.log(
      `[CRON/creator-manager-arc] Job complete: ${processedPrograms} programs, ` +
      `${processedPosts} posts, ${totalPointsAwarded} points awarded`
    );

    return res.status(200).json({
      ok: true,
      processedPrograms,
      processedCreators,
      processedPosts,
      pointsAwarded: totalPointsAwarded,
    });
  } catch (error: any) {
    console.error('[CRON/creator-manager-arc] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}

