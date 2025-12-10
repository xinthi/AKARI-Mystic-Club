/**
 * Topic Scoring Module for Zone of Expertise
 * 
 * Analyzes tweet content to determine what topics a profile primarily posts about.
 * Uses keyword-based classification and engagement weighting.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  PROFILE_TOPICS, 
  ProfileTopic, 
  TOPIC_KEYWORDS 
} from './topics.config';

// =============================================================================
// TYPES
// =============================================================================

export interface TopicScore {
  topic: ProfileTopic;
  score: number; // 0–100 normalized
  tweetCount: number;
  weightedScore: number;
}

export interface TweetForTopicAnalysis {
  text: string;
  likes: number;
  replies: number;
  retweets: number;
  created_at: string;
}

interface TopicAccumulator {
  count: number;
  weightedScore: number;
}

// =============================================================================
// CLASSIFICATION
// =============================================================================

/**
 * Classify a single tweet into topics based on keyword matching.
 * Returns up to 2 topics per tweet.
 */
export function classifyTweetTopics(text: string): ProfileTopic[] {
  const lowerText = text.toLowerCase();
  const matchedTopics: { topic: ProfileTopic; matchCount: number }[] = [];
  
  for (const topic of PROFILE_TOPICS) {
    const keywords = TOPIC_KEYWORDS[topic];
    let matchCount = 0;
    
    for (const keyword of keywords) {
      // Use word boundary matching for short keywords, contains for longer ones
      if (keyword.length <= 3) {
        // Short keyword - require word boundary
        const regex = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i');
        if (regex.test(lowerText)) {
          matchCount++;
        }
      } else {
        // Longer keyword - simple contains
        if (lowerText.includes(keyword.toLowerCase())) {
          matchCount++;
        }
      }
    }
    
    if (matchCount > 0) {
      matchedTopics.push({ topic, matchCount });
    }
  }
  
  // Sort by match count and return top 2
  matchedTopics.sort((a, b) => b.matchCount - a.matchCount);
  return matchedTopics.slice(0, 2).map(m => m.topic);
}

/**
 * Escape special regex characters
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Calculate engagement weight for a tweet.
 * More engagement = more influential for topic scoring.
 */
function calculateEngagementWeight(tweet: TweetForTopicAnalysis): number {
  // Base weight of 1, plus engagement bonus
  const engagement = tweet.likes + tweet.retweets * 2 + tweet.replies * 3;
  
  // Logarithmic scaling to prevent viral tweets from dominating
  // Weight ranges from 1 (no engagement) to ~5 (viral)
  return 1 + Math.log10(1 + engagement / 10);
}

// =============================================================================
// SCORING
// =============================================================================

/**
 * Analyze tweets and compute topic scores for a project.
 * Returns normalized scores (0-100) for each topic.
 */
export function computeTopicScores(tweets: TweetForTopicAnalysis[]): TopicScore[] {
  // Initialize accumulators for each topic
  const accumulators: Record<ProfileTopic, TopicAccumulator> = {} as any;
  for (const topic of PROFILE_TOPICS) {
    accumulators[topic] = { count: 0, weightedScore: 0 };
  }
  
  // Classify each tweet and accumulate scores
  for (const tweet of tweets) {
    const topics = classifyTweetTopics(tweet.text);
    const weight = calculateEngagementWeight(tweet);
    
    for (const topic of topics) {
      accumulators[topic].count++;
      accumulators[topic].weightedScore += weight;
    }
  }
  
  // Find max weighted score for normalization
  const maxWeightedScore = Math.max(
    ...Object.values(accumulators).map(a => a.weightedScore),
    1 // Prevent division by zero
  );
  
  // Build result array with normalized scores
  const results: TopicScore[] = [];
  
  for (const topic of PROFILE_TOPICS) {
    const acc = accumulators[topic];
    
    // Normalize to 0-100
    // Score is based on weighted engagement, normalized to the top topic
    const normalizedScore = Math.round((acc.weightedScore / maxWeightedScore) * 100);
    
    results.push({
      topic,
      score: normalizedScore,
      tweetCount: acc.count,
      weightedScore: Math.round(acc.weightedScore * 100) / 100,
    });
  }
  
  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  
  return results;
}

// =============================================================================
// DATABASE OPERATIONS
// =============================================================================

/**
 * Recompute and persist topic stats for a project.
 * 
 * @param supabase - Supabase client with service role
 * @param projectId - UUID of the project
 * @param window - Time window ('7d' or '30d')
 * @returns Array of topic scores
 */
export async function recomputeProjectTopicStats(
  supabase: SupabaseClient,
  projectId: string,
  window: '7d' | '30d' = '30d'
): Promise<TopicScore[]> {
  console.log(`   📊 Computing topic stats for project ${projectId} (${window})...`);
  
  // Calculate date range
  const now = new Date();
  const daysBack = window === '7d' ? 7 : 30;
  const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  
  // Fetch tweets for this project in the window
  const { data: tweets, error: fetchError } = await supabase
    .from('project_tweets')
    .select('text, likes, replies, retweets, created_at')
    .eq('project_id', projectId)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false });
  
  if (fetchError) {
    console.error(`   ❌ Error fetching tweets for topic analysis:`, fetchError.message);
    return [];
  }
  
  if (!tweets || tweets.length === 0) {
    console.log(`   ⚠️ No tweets found in ${window} window for topic analysis`);
    return [];
  }
  
  console.log(`   📝 Analyzing ${tweets.length} tweets for topics...`);
  
  // Compute topic scores
  const scores = computeTopicScores(tweets as TweetForTopicAnalysis[]);
  
  // Prepare upsert data
  const upsertData = scores.map(score => ({
    project_id: projectId,
    topic: score.topic,
    time_window: window,
    score: score.score,
    tweet_count: score.tweetCount,
    weighted_score: score.weightedScore,
  }));
  
  // Upsert to database
  const { error: upsertError } = await supabase
    .from('project_topic_stats')
    .upsert(upsertData, {
      onConflict: 'project_id,topic,time_window',
    });
  
  if (upsertError) {
    console.error(`   ❌ Error upserting topic stats:`, upsertError.message);
    return scores;
  }
  
  // Log top topics
  const topTopics = scores.filter(s => s.score > 0).slice(0, 3);
  if (topTopics.length > 0) {
    const topList = topTopics.map(t => `${t.topic}(${t.score})`).join(', ');
    console.log(`   ✅ Topic stats saved. Top topics: ${topList}`);
  } else {
    console.log(`   ⚠️ No topics detected in tweets`);
  }
  
  return scores;
}

/**
 * Fetch topic stats for a project from the database.
 * 
 * @param supabase - Supabase client
 * @param projectId - UUID of the project
 * @param window - Time window ('7d' or '30d')
 * @returns Array of topic scores sorted by score descending
 */
export async function getProjectTopicStats(
  supabase: SupabaseClient,
  projectId: string,
  window: '7d' | '30d' = '30d'
): Promise<TopicScore[]> {
  const { data, error } = await supabase
    .from('project_topic_stats')
    .select('topic, score, tweet_count, weighted_score')
    .eq('project_id', projectId)
    .eq('time_window', window)
    .order('score', { ascending: false });
  
  if (error) {
    console.error(`Error fetching topic stats for project ${projectId}:`, error.message);
    return [];
  }
  
  return (data || []).map(row => ({
    topic: row.topic as ProfileTopic,
    score: row.score,
    tweetCount: row.tweet_count,
    weightedScore: row.weighted_score,
  }));
}

// Re-export types and config
export { PROFILE_TOPICS, TOPIC_KEYWORDS, TOPIC_DISPLAY } from './topics.config';
export type { ProfileTopic } from './topics.config';

