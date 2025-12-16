/**
 * ARC Scoring Engine
 * 
 * Scores creator content for ARC campaigns based on:
 * - Content type (thread, deep dive, meme, etc.)
 * - Sentiment (positive, neutral, negative)
 * - Engagement (likes, retweets, quotes, replies)
 * 
 * This module provides the core scoring logic and job runner.
 * TODO hooks are left for integrating with existing tweet fetch and classification systems.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

export type RingKey = 'core' | 'momentum' | 'discovery';

export type ContentType =
  | 'thread'
  | 'deep_dive'
  | 'meme'
  | 'quote_rt'
  | 'retweet'
  | 'reply'
  | 'other';

export interface ArcCreatorContext {
  profileId: string;
  arenaId: string;
  projectId: string;
  twitterUsername: string;
  currentPoints: number;
  currentRing: RingKey | null;
}

export interface ScoredPost {
  tweetId: string;
  contentType: ContentType;
  basePoints: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentMultiplier: number;
  engagementScore: number;
  deltaPoints: number;
}

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

/**
 * Get Supabase admin client for service role access
 */
function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('[ARC Scoring] Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  }

  if (!supabaseServiceRoleKey) {
    throw new Error('[ARC Scoring] Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// =============================================================================
// SCORING HELPERS
// =============================================================================

/**
 * Get base points for a content type
 */
function basePoints(contentType: ContentType): number {
  switch (contentType) {
    case 'thread':
      return 30;
    case 'deep_dive':
      return 50;
    case 'meme':
      return 20;
    case 'quote_rt':
      return 15;
    case 'retweet':
      return 5;
    case 'reply':
      return 5;
    default:
      return 0;
  }
}

/**
 * Get sentiment multiplier
 */
function sentimentMultiplier(s: 'positive' | 'neutral' | 'negative'): number {
  if (s === 'positive') return 1.2;
  if (s === 'neutral') return 1.0;
  return 0.5;
}

/**
 * Calculate engagement score from metrics
 * Uses logarithmic scaling to prevent extreme outliers from dominating
 */
function engagement(likes: number, rts: number, quotes: number, replies: number): number {
  const raw = likes + rts * 2 + quotes * 2 + replies;
  return raw <= 0 ? 0 : Math.log2(raw + 1);
}

// =============================================================================
// SCORE A SINGLE POST
// =============================================================================

/**
 * Score a single post based on content type, sentiment, and engagement
 */
export function scorePost(params: {
  tweetId: string;
  contentType: ContentType;
  sentiment: 'positive' | 'neutral' | 'negative';
  likes: number;
  retweets: number;
  quotes: number;
  replies: number;
}): ScoredPost {
  const base = basePoints(params.contentType);
  const mult = sentimentMultiplier(params.sentiment);
  const eng = engagement(params.likes, params.retweets, params.quotes, params.replies);

  // Formula: base * sentiment_multiplier * (1 + engagement_bonus)
  // engagement_bonus is capped at 4x via the division
  const delta = Math.round(base * mult * (1 + eng / 4));

  return {
    tweetId: params.tweetId,
    contentType: params.contentType,
    basePoints: base,
    sentiment: params.sentiment,
    sentimentMultiplier: mult,
    engagementScore: eng,
    deltaPoints: delta,
  };
}

// =============================================================================
// TODO HOOKS - TO BE IMPLEMENTED
// =============================================================================

/**
 * Fetch relevant tweets for a creator in an ARC arena
 * 
 * TODO: Integrate with existing sentiment/tweet ingestion system
 * Must return array of tweets with:
 * - tweetId: string
 * - text: string
 * - likes: number
 * - retweets: number
 * - quotes: number
 * - replies: number
 */
async function fetchArcRelevantTweets(creator: ArcCreatorContext): Promise<Array<{
  tweetId: string;
  text: string;
  likes: number;
  retweets: number;
  quotes: number;
  replies: number;
}>> {
  // TODO: integrate with existing Twitter fetch logic
  // This should:
  // 1. Fetch recent tweets from creator.twitterUsername
  // 2. Filter for tweets mentioning/related to the project (projectId)
  // 3. Return tweet data with engagement metrics
  // 
  // Consider using:
  // - Existing RapidAPI Twitter helpers
  // - Project tweet ingestion system
  // - Sentiment Engine tweet storage
  
  console.log(`[ARC Scoring] TODO: fetchArcRelevantTweets for @${creator.twitterUsername} in project ${creator.projectId}`);
  return [];
}

/**
 * Classify a tweet for content type and sentiment
 * 
 * TODO: Integrate with existing sentiment + topic + content-type systems
 * Must return:
 * - contentType: ContentType
 * - sentiment: 'positive' | 'neutral' | 'negative'
 */
async function classifyForArc(tweet: {
  tweetId: string;
  text: string;
  likes: number;
  retweets: number;
  quotes: number;
  replies: number;
}): Promise<{
  contentType: ContentType;
  sentiment: 'positive' | 'neutral' | 'negative';
}> {
  // TODO: integrate with existing classification systems
  // This should:
  // 1. Determine content type (thread, deep_dive, meme, quote_rt, retweet, reply, other)
  //    - Check if tweet is part of a thread (has thread_id or is reply to self)
  //    - Check if tweet is a quote RT (has quoted_tweet_id)
  //    - Check if tweet is a retweet (is_retweet flag)
  //    - Check if tweet is a reply (in_reply_to_tweet_id exists)
  //    - Analyze text length/complexity for deep_dive vs meme
  // 2. Classify sentiment (positive, neutral, negative)
  //    - Use existing sentiment analysis from Sentiment Engine
  //    - Consider using project_tweets.sentiment_score if available
  //
  // Consider using:
  // - Sentiment Engine classification
  // - Topic detection systems
  // - Content type heuristics
  
  console.log(`[ARC Scoring] TODO: classifyForArc for tweet ${tweet.tweetId}`);
  return {
    contentType: 'other',
    sentiment: 'neutral',
  };
}

// =============================================================================
// MAIN SCORING JOB
// =============================================================================

export interface ArcScoringJobResult {
  processedCreators: number;
  processedTweets: number;
  updatedPoints: number;
}

/**
 * Run the ARC scoring job for all active arenas
 * 
 * This function:
 * 1. Discovers all active ARC arenas
 * 2. Loads all creators participating in them
 * 3. Fetches recent project-related tweets for each creator
 * 4. Scores those tweets based on content type, sentiment, and engagement
 * 5. Applies delta ARC points to arena_creators.arc_points
 */
export async function runArcScoringJob(): Promise<ArcScoringJobResult> {
  const supabase = getSupabaseAdmin();

  console.log('[ARC Scoring] Starting scoring job...');

  // 1. Load active arenas
  const { data: arenas, error: arenasError } = await supabase
    .from('arenas')
    .select('*')
    .eq('status', 'active');

  if (arenasError) {
    console.error('[ARC Scoring] Error loading arenas:', arenasError);
    throw new Error(`Failed to load arenas: ${arenasError.message}`);
  }

  if (!arenas || arenas.length === 0) {
    console.log('[ARC Scoring] No active arenas found');
    return {
      processedCreators: 0,
      processedTweets: 0,
      updatedPoints: 0,
    };
  }

  console.log(`[ARC Scoring] Found ${arenas.length} active arena(s)`);

  // 2. Load creators for these arenas
  const arenaIds = arenas.map((a: any) => a.id);

  const { data: creators, error: creatorsError } = await supabase
    .from('arena_creators')
    .select('*')
    .in('arena_id', arenaIds);

  if (creatorsError) {
    console.error('[ARC Scoring] Error loading creators:', creatorsError);
    throw new Error(`Failed to load creators: ${creatorsError.message}`);
  }

  if (!creators || creators.length === 0) {
    console.log('[ARC Scoring] No creators found in active arenas');
    return {
      processedCreators: 0,
      processedTweets: 0,
      updatedPoints: 0,
    };
  }

  console.log(`[ARC Scoring] Found ${creators.length} creator(s) in active arenas`);

  // 3. Group creators by arena and prepare context
  const grouped: ArcCreatorContext[] = creators.map((c: any) => {
    const arena = arenas.find((a: any) => a.id === c.arena_id);
    return {
      profileId: c.profile_id,
      arenaId: c.arena_id,
      projectId: arena?.project_id || '',
      twitterUsername: c.twitter_username || '',
      currentPoints: Number(c.arc_points) || 0,
      currentRing: (c.ring as RingKey) || null,
    };
  });

  let processedTweets = 0;
  let updatedPoints = 0;
  let processedCreators = 0;

  // 4. Iterate creators and score their tweets
  for (const creator of grouped) {
    if (!creator.twitterUsername) {
      console.log(`[ARC Scoring] Skipping creator ${creator.profileId} - no Twitter username`);
      continue;
    }

    if (!creator.projectId) {
      console.log(`[ARC Scoring] Skipping creator ${creator.profileId} - no project ID`);
      continue;
    }

    try {
      // Fetch relevant tweets for this creator
      const tweets = await fetchArcRelevantTweets(creator);

      if (tweets.length === 0) {
        console.log(`[ARC Scoring] No tweets found for @${creator.twitterUsername}`);
        continue;
      }

      console.log(`[ARC Scoring] Processing ${tweets.length} tweet(s) for @${creator.twitterUsername}`);

      let creatorDeltaPoints = 0;

      // Score each tweet
      for (const tweet of tweets) {
        // Classify tweet (content type + sentiment)
        const classification = await classifyForArc(tweet);

        // Score the tweet
        const score = scorePost({
          tweetId: tweet.tweetId,
          contentType: classification.contentType,
          sentiment: classification.sentiment,
          likes: tweet.likes,
          retweets: tweet.retweets,
          quotes: tweet.quotes,
          replies: tweet.replies,
        });

        processedTweets++;

        if (score.deltaPoints > 0) {
          creatorDeltaPoints += score.deltaPoints;
          console.log(
            `[ARC Scoring] Tweet ${tweet.tweetId}: +${score.deltaPoints} points ` +
            `(${classification.contentType}, ${classification.sentiment}, ${score.engagementScore.toFixed(2)} engagement)`
          );
        }
      }

      // Update creator's points if there are any changes
      if (creatorDeltaPoints > 0) {
        const newPoints = creator.currentPoints + creatorDeltaPoints;

        const { error: updateError } = await supabase
          .from('arena_creators')
          .update({
            arc_points: newPoints,
          })
          .match({
            arena_id: creator.arenaId,
            profile_id: creator.profileId,
          });

        if (updateError) {
          console.error(
            `[ARC Scoring] Error updating points for creator ${creator.profileId}:`,
            updateError
          );
        } else {
          updatedPoints += creatorDeltaPoints;
          console.log(
            `[ARC Scoring] Updated @${creator.twitterUsername}: ` +
            `${creator.currentPoints} → ${newPoints} (+${creatorDeltaPoints})`
          );
        }
      }

      processedCreators++;
    } catch (error: any) {
      console.error(
        `[ARC Scoring] Error processing creator @${creator.twitterUsername}:`,
        error
      );
      // Continue with next creator
    }
  }

  console.log(
    `[ARC Scoring] Job complete: ${processedCreators} creators, ` +
    `${processedTweets} tweets, ${updatedPoints} points awarded`
  );

  return {
    processedCreators,
    processedTweets,
    updatedPoints,
  };
}

