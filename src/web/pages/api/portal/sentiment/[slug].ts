/**
 * API Route: GET /api/portal/sentiment/[slug]
 * 
 * Returns detailed sentiment data for a specific project:
 * - Project info (name, handle, bio, avatar)
 * - Metrics history (last 90 days)
 * - 24h changes for latest metrics
 * - Top influencers for this project
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

/**
 * Response type for this endpoint
 */
type SentimentDetailResponse =
  | {
      ok: true;
      project: Project;
      metrics: MetricsDaily[];
      latestMetrics: MetricsDaily | null;
      previousMetrics: MetricsDaily | null;
      changes24h: MetricsChange24h;
      influencers: InfluencerWithRelation[];
    }
  | {
      ok: false;
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SentimentDetailResponse>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  // Get slug from URL
  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Project slug is required',
    });
  }

  try {
    // Create Supabase client (read-only with anon key)
    const supabase = createPortalClient();

    // Fetch project by slug
    const project = await getProjectBySlug(supabase, slug);

    if (!project) {
      return res.status(404).json({
        ok: false,
        error: 'Project not found',
      });
    }

    // Fetch metrics history and influencers in parallel
    const [metrics, influencers] = await Promise.all([
      getProjectMetricsHistory(supabase, project.id, 90),
      getProjectInfluencers(supabase, project.id, 10),
    ]);

    // Extract latest and previous metrics for 24h changes
    const latestMetrics = metrics.length > 0 ? metrics[0] : null;
    const previousMetrics = metrics.length > 1 ? metrics[1] : null;
    const changes24h = compute24hChanges(latestMetrics, previousMetrics);

    return res.status(200).json({
      ok: true,
      project,
      metrics,
      latestMetrics,
      previousMetrics,
      changes24h,
      influencers,
    });
  } catch (error: any) {
    console.error(`[API /portal/sentiment/${slug}] Error:`, error);

    // Check for specific Supabase errors
    if (error.message?.includes('configuration missing')) {
      return res.status(503).json({
        ok: false,
        error: 'Sentiment service is not configured',
      });
    }

    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch project data',
    });
  }
}
