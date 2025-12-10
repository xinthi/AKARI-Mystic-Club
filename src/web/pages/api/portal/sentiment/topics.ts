/**
 * API Route: GET /api/portal/sentiment/topics
 * 
 * Returns aggregated topic heatmap data across all active projects for the last 30 days.
 * No authentication required (same as /api/portal/sentiment main route).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface TopicSummary {
  topic: string;
  projectsCount: number;
  totalWeightedScore: number;
  totalTweetCount: number;
  avgScore: number;
}

type TopicsResponse =
  | {
      ok: true;
      topics: TopicSummary[];
    }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TopicsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Use read-only client for queries (no auth required, same as main sentiment route)
    const supabase = createPortalClient();

    // 1. Get active projects
    const { data: activeProjects, error: projectsError } = await supabase
      .from('projects')
      .select('id')
      .eq('is_active', true)
      .neq('slug', 'dev_user'); // Exclude dev_user like in other endpoints

    if (projectsError) {
      console.error('[Sentiment Topics API] Error fetching projects:', projectsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch projects' });
    }

    const projectIds = activeProjects?.map((p) => p.id) ?? [];

    if (projectIds.length === 0) {
      return res.status(200).json({ ok: true, topics: [] });
    }

    // 2. Get project_topic_stats for active projects with time_window = '30d'
    const { data: topicStats, error: statsError } = await supabase
      .from('project_topic_stats')
      .select('project_id, topic, score, weighted_score, tweet_count')
      .in('project_id', projectIds)
      .eq('time_window', '30d');

    if (statsError) {
      console.error('[Sentiment Topics API] Error fetching topic stats:', statsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch topic stats' });
    }

    if (!topicStats || topicStats.length === 0) {
      return res.status(200).json({ ok: true, topics: [] });
    }

    // 3. Aggregate by topic
    const topicMap = new Map<string, {
      projects: Set<string>;
      totalWeightedScore: number;
      totalTweetCount: number;
      totalScore: number;
    }>();

    for (const stat of topicStats) {
      const topic = stat.topic;
      const projectId = stat.project_id;
      const weightedScore = stat.weighted_score ?? 0;
      const tweetCount = stat.tweet_count ?? 0;
      const score = stat.score ?? 0;

      if (!topicMap.has(topic)) {
        topicMap.set(topic, {
          projects: new Set(),
          totalWeightedScore: 0,
          totalTweetCount: 0,
          totalScore: 0,
        });
      }

      const topicData = topicMap.get(topic)!;
      topicData.projects.add(projectId);
      topicData.totalWeightedScore += weightedScore;
      topicData.totalTweetCount += tweetCount;
      topicData.totalScore += score;
    }

    // 4. Build topic summaries
    const topics: TopicSummary[] = Array.from(topicMap.entries()).map(([topic, data]) => {
      const projectsCount = data.projects.size;
      const avgScore = projectsCount > 0 ? data.totalScore / projectsCount : 0;

      return {
        topic,
        projectsCount,
        totalWeightedScore: data.totalWeightedScore,
        totalTweetCount: data.totalTweetCount,
        avgScore,
      };
    });

    // 5. Sort by totalWeightedScore descending
    topics.sort((a, b) => b.totalWeightedScore - a.totalWeightedScore);

    return res.status(200).json({ ok: true, topics });
  } catch (error: any) {
    console.error('[Sentiment Topics API] Error:', error);
    
    // Check for specific Supabase errors
    if (error.message?.includes('configuration missing')) {
      return res.status(503).json({
        ok: false,
        error: 'Sentiment service is not configured',
      });
    }

    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

