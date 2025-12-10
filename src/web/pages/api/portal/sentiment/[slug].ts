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
import { getProjectTopicStats, TopicScore } from '@/lib/portal/topic-stats';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Tweet data for chart markers - uses camelCase for frontend consistency
 */
interface ProjectTweet {
  tweetId: string;
  createdAt: string;
  authorHandle: string;
  authorName: string | null;
  authorProfileImageUrl: string | null;
  text: string;
  likes: number;
  replies: number;
  retweets: number;
  sentimentScore: number | null;
  engagementScore: number | null;
  tweetUrl: string;
  isKOL: boolean;
  isOfficial: boolean;
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
      topics30d: TopicScore[];
      metricsHistoryLong?: MetricsDaily[]; // 90-day history for Deep Explorer
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

    // Fetch metrics history, influencers, tweets, topic stats, and fallback followers in parallel
    const [metrics, metrics90d, influencers, tweetsResult, topics30d, followersFallbackResult] = await Promise.all([
      getProjectMetricsHistory(supabase, project.id, 30),
      getProjectMetricsHistory(supabase, project.id, 90), // 90-day history for Deep Explorer
      getProjectInfluencers(supabase, project.id, 10),
      supabase
        .from('project_tweets')
        .select(`
          tweet_id,
          created_at,
          author_handle,
          author_name,
          author_profile_image_url,
          text,
          likes,
          replies,
          retweets,
          sentiment_score,
          engagement_score,
          tweet_url,
          is_kol,
          is_official
        `)
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(50),
      getProjectTopicStats(supabase, project.id, '30d'),
      // Get most recent non-zero followers value as fallback
      supabase
        .from('metrics_daily')
        .select('followers, date')
        .eq('project_id', project.id)
        .gt('followers', 0)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(), // Use maybeSingle() instead of single() to handle no results gracefully
    ]);

    // DEBUG: Log tweet query results
    console.log(`[API /portal/sentiment/${slug}] Project ID: ${project.id}`);
    console.log(`[API /portal/sentiment/${slug}] Tweets query result: ${tweetsResult.data?.length || 0} tweets, error: ${tweetsResult.error?.message || 'none'}`);
    if (tweetsResult.data && tweetsResult.data.length > 0) {
      console.log(`[API /portal/sentiment/${slug}] Sample tweet:`, JSON.stringify(tweetsResult.data[0], null, 2));
    }

    // Map tweets to camelCase for frontend
    // Use project's x_handle as fallback for author when constructing URLs
    const projectHandle = project.x_handle || project.slug;
    const tweets: ProjectTweet[] = (tweetsResult.data || []).map((t: any) => {
      const authorHandle = t.author_handle || projectHandle;
      // Prefer stored tweet_url, but validate it's not malformed (no double slashes)
      let tweetUrl = t.tweet_url;
      if (!tweetUrl || tweetUrl.includes('//status/')) {
        // Reconstruct URL if missing or malformed
        tweetUrl = `https://x.com/${authorHandle}/status/${t.tweet_id}`;
      }
      return {
        tweetId: t.tweet_id,
        createdAt: t.created_at,
        authorHandle,
        authorName: t.author_name || authorHandle,
        authorProfileImageUrl: t.author_profile_image_url || null,
        text: t.text || '',
        likes: t.likes || 0,
        replies: t.replies || 0,
        retweets: t.retweets || 0,
        sentimentScore: t.sentiment_score ?? null,
        engagementScore: t.engagement_score ?? ((t.likes || 0) + (t.retweets || 0) * 2 + (t.replies || 0) * 3),
        tweetUrl,
        isKOL: t.is_kol || false,
        isOfficial: t.is_official || false,
      };
    });

    // Extract latest and previous metrics for 24h changes
    let latestMetrics = metrics.length > 0 ? metrics[0] : null;
    const previousMetrics = metrics.length > 1 ? metrics[1] : null;
    
    // Apply followers fallback: use latest if > 0, else use most recent non-zero value
    const fallbackFollowers = followersFallbackResult.data?.followers ?? null;
    if (latestMetrics) {
      const metricsFollowers = latestMetrics.followers ?? null;
      const finalFollowers = 
        (metricsFollowers !== null && metricsFollowers > 0)
          ? metricsFollowers
          : (fallbackFollowers !== null && fallbackFollowers > 0)
          ? fallbackFollowers
          : null;
      
      // Create a new object with updated followers to avoid mutation
      latestMetrics = {
        ...latestMetrics,
        followers: finalFollowers,
      };
      
      // Also update the first entry in the metrics array so the history table shows correct value
      if (metrics.length > 0) {
        metrics[0] = {
          ...metrics[0],
          followers: finalFollowers,
        };
      }
    }
    
    const changes24h = compute24hChanges(latestMetrics, previousMetrics);

    // DEBUG: Log metrics and influencers
    console.log(`[API /portal/sentiment/${slug}] Metrics: ${metrics.length} days, latest tweet_count: ${metrics[0]?.tweet_count ?? 'N/A'}`);
    console.log(`[API /portal/sentiment/${slug}] Influencers: ${influencers.length}`);
    console.log(`[API /portal/sentiment/${slug}] Project inner_circle_count: ${(project as any).inner_circle_count}, inner_circle_power: ${(project as any).inner_circle_power}`);

    // Compute inner circle summary from project data or estimate from influencers
    const innerCircle: InnerCircleSummary = {
      count: (project as any).inner_circle_count || influencers.length,
      power: (project as any).inner_circle_power || 
        influencers.reduce((sum, inf) => sum + (inf.akari_score || 0), 0),
    };

    // Ensure we have a profile image URL and add last_updated_at
    const enhancedProject = {
      ...project,
      twitter_profile_image_url: 
        (project as any).twitter_profile_image_url || 
        project.avatar_url ||
        null,
      last_updated_at: latestMetrics?.updated_at ?? latestMetrics?.created_at ?? null,
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
      topics30d,
      metricsHistoryLong: metrics90d, // 90-day history for Deep Explorer
    });
  } catch (error: any) {
    console.error(`[API /portal/sentiment/${slug}] Error:`, error);

    if (error.message?.includes('configuration missing')) {
      return res.status(503).json({ ok: false, error: 'Sentiment service is not configured' });
    }

    return res.status(500).json({ ok: false, error: error.message || 'Failed to fetch project data' });
  }
}
