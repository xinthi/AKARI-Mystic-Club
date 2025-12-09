/**
 * Topic Stats Query Helper
 * 
 * Web-compatible functions for fetching topic statistics from Supabase.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { 
  PROFILE_TOPICS, 
  ProfileTopic, 
  TopicScore 
} from '@/components/portal/profile';

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

// Re-export types for convenience
export { PROFILE_TOPICS, type ProfileTopic, type TopicScore };

