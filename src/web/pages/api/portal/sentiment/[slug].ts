/**
 * API Route: GET /api/portal/sentiment/[slug]
 * 
 * Returns detailed sentiment data for a specific project:
 * - Project info with profile image
 * - Metrics history (last 30 days) for charts
 * - 24h changes for latest metrics
 * - Project tweets for chart markers
 * - Top influencers (inner circle members)
 * - Inner circle summary
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createPortalClient,
  getProjectBySlug,
  getProjectMetricsHistory,
  getProjectInfluencers,
  compute24hChanges,
  Project,
  MetricsDaily,
  MetricsChange24h,
  InfluencerWithRelation,
} from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface ProjectTweet {
  id: string;
  tweet_id: string;
  tweet_url: string | null;
  author_handle: string;
  author_name: string | null;
  author_profile_image_url: string | null;
  created_at: string;
  text: string | null;
  likes: number;
  replies: number;
  retweets: number;
  sentiment_score: number | null;
  engagement_score: number | null;
  is_kol: boolean;
  is_official: boolean;
}

interface InnerCircleSummary {
  count: number;
  power: number;
}

type SentimentDetailResponse =
  | {
      ok: true;
      project: Project & {
        twitter_profile_image_url?: string | null;
      };
      metrics: MetricsDaily[];
      latestMetrics: MetricsDaily | null;
      previousMetrics: MetricsDaily | null;
      changes24h: MetricsChange24h;
      tweets: ProjectTweet[];
      influencers: InfluencerWithRelation[];
      innerCircle: InnerCircleSummary;
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SentimentDetailResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ ok: false, error: 'Project slug is required' });
  }

  try {
    const supabase = createPortalClient();

    // Fetch project by slug
    const project = await getProjectBySlug(supabase, slug);

    if (!project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    // Fetch metrics history, influencers, and tweets in parallel
    const [metrics, influencers, tweetsResult] = await Promise.all([
      getProjectMetricsHistory(supabase, project.id, 30),
      getProjectInfluencers(supabase, project.id, 10),
      supabase
        .from('project_tweets')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    // Process tweets
    const tweets: ProjectTweet[] = (tweetsResult.data || []).map((t: any) => ({
      id: t.id,
      tweet_id: t.tweet_id,
      tweet_url: t.tweet_url || `https://x.com/i/status/${t.tweet_id}`,
      author_handle: t.author_handle,
      author_name: t.author_name || t.author_handle,
      author_profile_image_url: t.author_profile_image_url || null,
      created_at: t.created_at,
      text: t.text,
      likes: t.likes || 0,
      replies: t.replies || 0,
      retweets: t.retweets || 0,
      sentiment_score: t.sentiment_score,
      engagement_score: t.engagement_score || (t.likes + t.retweets * 2 + t.replies * 3),
      is_kol: t.is_kol || false,
      is_official: t.is_official || false,
    }));

    // Extract latest and previous metrics for 24h changes
    const latestMetrics = metrics.length > 0 ? metrics[0] : null;
    const previousMetrics = metrics.length > 1 ? metrics[1] : null;
    const changes24h = compute24hChanges(latestMetrics, previousMetrics);

    // Compute inner circle summary from project data or estimate from influencers
    const innerCircle: InnerCircleSummary = {
      count: (project as any).inner_circle_count || influencers.length,
      power: (project as any).inner_circle_power || 
        influencers.reduce((sum, inf) => sum + (inf.akari_score || 0), 0),
    };

    // Ensure we have a profile image URL
    const enhancedProject = {
      ...project,
      twitter_profile_image_url: 
        (project as any).twitter_profile_image_url || 
        project.avatar_url ||
        null,
    };

    return res.status(200).json({
      ok: true,
      project: enhancedProject,
      metrics,
      latestMetrics,
      previousMetrics,
      changes24h,
      tweets,
      influencers,
      innerCircle,
    });
  } catch (error: any) {
    console.error(`[API /portal/sentiment/${slug}] Error:`, error);

    if (error.message?.includes('configuration missing')) {
      return res.status(503).json({ ok: false, error: 'Sentiment service is not configured' });
    }

    return res.status(500).json({ ok: false, error: error.message || 'Failed to fetch project data' });
  }
}
