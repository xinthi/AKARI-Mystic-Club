/**
 * Creator Manager ARC Scoring
 * 
 * Reuses existing ARC scoring logic to calculate and update ARC points
 * for creators in Creator Manager programs.
 * 
 * This module provides:
 * - Reusable scoring function that wraps existing ARC scoring
 * - Function to add ARC points to creator_manager_creators
 * - Integration with existing engagement and sentiment data
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { scorePost, type ContentType, type ScoredPost } from './scoring';

// =============================================================================
// TYPES
// =============================================================================

export interface EngagementMetrics {
  likes: number;
  retweets: number;
  quotes: number;
  replies: number;
}

export interface ArcScoringInput {
  contentType: ContentType;
  sentiment: 'positive' | 'neutral' | 'negative';
  engagement: EngagementMetrics;
  tweetId?: string;
}

export interface AddArcPointsResult {
  success: boolean;
  pointsAwarded: number;
  newTotalPoints: number;
  error?: string;
}

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('[Creator Manager Scoring] Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  }

  if (!supabaseServiceRoleKey) {
    throw new Error('[Creator Manager Scoring] Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// =============================================================================
// REUSABLE ARC SCORING FUNCTION
// =============================================================================

/**
 * Calculate ARC points for a post using the existing ARC scoring formula
 * 
 * Formula: base * sentiment_multiplier * (1 + engagement_bonus)
 * where engagement_bonus = engagement_score / 4
 * 
 * This wraps the existing scorePost() function to provide a clean interface
 * for Creator Manager scoring.
 */
export function calculateArcPointsForCreatorManager(input: ArcScoringInput): number {
  const scoredPost = scorePost({
    tweetId: input.tweetId || '',
    contentType: input.contentType,
    sentiment: input.sentiment,
    likes: input.engagement.likes,
    retweets: input.engagement.retweets,
    quotes: input.engagement.quotes,
    replies: input.engagement.replies,
  });

  return scoredPost.deltaPoints;
}

/**
 * Get detailed scoring breakdown for debugging
 */
export function calculateArcPointsDetailed(input: ArcScoringInput): ScoredPost {
  return scorePost({
    tweetId: input.tweetId || '',
    contentType: input.contentType,
    sentiment: input.sentiment,
    likes: input.engagement.likes,
    retweets: input.engagement.retweets,
    quotes: input.engagement.quotes,
    replies: input.engagement.replies,
  });
}

// =============================================================================
// ADD ARC POINTS TO CREATOR MANAGER
// =============================================================================

/**
 * Add ARC points to a creator in a Creator Manager program
 * 
 * This increments creator_manager_creators.arc_points by the calculated amount.
 * 
 * @param programId - Creator Manager program ID
 * @param creatorProfileId - Profile ID of the creator
 * @param pointsToAdd - ARC points to add (calculated via calculateArcPointsForCreatorManager)
 * @returns Result with new total points
 */
export async function addArcPointsForCreatorManager(
  programId: string,
  creatorProfileId: string,
  pointsToAdd: number
): Promise<AddArcPointsResult> {
  const supabase = getSupabaseAdmin();

  try {
    // Get current creator record
    const { data: creator, error: fetchError } = await supabase
      .from('creator_manager_creators')
      .select('arc_points')
      .eq('program_id', programId)
      .eq('creator_profile_id', creatorProfileId)
      .single();

    if (fetchError || !creator) {
      return {
        success: false,
        pointsAwarded: 0,
        newTotalPoints: 0,
        error: 'Creator not found in this program',
      };
    }

    const currentPoints = creator.arc_points || 0;
    const newTotalPoints = currentPoints + pointsToAdd;

    // Update creator's ARC points
    const { error: updateError } = await supabase
      .from('creator_manager_creators')
      .update({ arc_points: newTotalPoints })
      .eq('program_id', programId)
      .eq('creator_profile_id', creatorProfileId);

    if (updateError) {
      console.error('[Creator Manager Scoring] Error updating ARC points:', updateError);
      return {
        success: false,
        pointsAwarded: 0,
        newTotalPoints: currentPoints,
        error: updateError.message,
      };
    }

    return {
      success: true,
      pointsAwarded: pointsToAdd,
      newTotalPoints,
    };
  } catch (error: any) {
    console.error('[Creator Manager Scoring] Error:', error);
    return {
      success: false,
      pointsAwarded: 0,
      newTotalPoints: 0,
      error: error.message || 'Internal server error',
    };
  }
}

/**
 * Score a post and add ARC points to creator in one operation
 * 
 * Convenience function that combines calculation and update.
 */
export async function scoreAndAddArcPoints(
  programId: string,
  creatorProfileId: string,
  input: ArcScoringInput
): Promise<AddArcPointsResult> {
  const pointsToAdd = calculateArcPointsForCreatorManager(input);
  return await addArcPointsForCreatorManager(programId, creatorProfileId, pointsToAdd);
}

// =============================================================================
// TODO: INTEGRATION WITH ENGAGEMENT DATA
// =============================================================================

/**
 * TODO: Fetch engagement metrics from X API or project_tweets table
 * 
 * This function should:
 * 1. Take a tweet_id or post_url
 * 2. Fetch engagement data (likes, retweets, quotes, replies)
 * 3. Return EngagementMetrics
 * 
 * Integration points:
 * - X API via RapidAPI (existing Twitter client)
 * - project_tweets table (if tweet is already tracked)
 * - Real-time engagement fetching
 */
export async function fetchEngagementMetrics(
  tweetId: string,
  postUrl?: string
): Promise<EngagementMetrics | null> {
  // TODO: Implement engagement fetching
  // 1. Check project_tweets table for existing data
  // 2. If not found, fetch from X API
  // 3. Return metrics or null if not found
  
  console.log(`[Creator Manager Scoring] TODO: fetchEngagementMetrics for tweet ${tweetId}`);
  return null;
}

/**
 * TODO: Classify content type and sentiment from tweet data
 * 
 * This should integrate with:
 * - Existing sentiment analysis
 * - Content type detection (thread, deep_dive, meme, etc.)
 * - project_tweets classification if available
 */
export async function classifyPostForCreatorManager(
  tweetId: string,
  text?: string
): Promise<{
  contentType: ContentType;
  sentiment: 'positive' | 'neutral' | 'negative';
} | null> {
  // TODO: Implement classification
  // 1. Check project_tweets for existing classification
  // 2. Use sentiment analysis from Sentiment Engine
  // 3. Detect content type (thread, deep_dive, meme, etc.)
  
  console.log(`[Creator Manager Scoring] TODO: classifyPostForCreatorManager for tweet ${tweetId}`);
  return null;
}

