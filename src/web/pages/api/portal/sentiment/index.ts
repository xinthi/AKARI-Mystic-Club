/**
 * API Route: GET /api/portal/sentiment
 * 
 * Returns a list of all active projects with their latest sentiment metrics,
 * 24h changes, top movers, top engagement, and trending projects.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createPortalClient,
  getProjectsWithLatestMetrics,
  computeTopMovers,
  computeTopEngagement,
  computeTrendingUp,
  ProjectWithMetrics,
  TopMover,
  TopEngagement,
  TrendingUp,
} from '@/lib/portal/supabase';

/**
 * Response type for this endpoint
 */
type SentimentOverviewResponse =
  | {
      ok: true;
      projects: ProjectWithMetrics[];
      topMovers: TopMover[];
      topEngagement: TopEngagement[];
      trendingUp: TrendingUp[];
    }
  | {
      ok: false;
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SentimentOverviewResponse>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  try {
    // Create Supabase client (read-only with anon key)
    const supabase = createPortalClient();

    // Fetch projects with their latest metrics and 24h changes
    const projects = await getProjectsWithLatestMetrics(supabase);

    // Sort by AKARI score descending (projects with score first, then null scores)
    projects.sort((a, b) => {
      if (a.akari_score === null && b.akari_score === null) return 0;
      if (a.akari_score === null) return 1;
      if (b.akari_score === null) return -1;
      return b.akari_score - a.akari_score;
    });

    // Compute widgets
    const topMovers = computeTopMovers(projects, 3);
    const topEngagement = computeTopEngagement(projects, 3);
    const trendingUp = computeTrendingUp(projects, 3);

    return res.status(200).json({
      ok: true,
      projects,
      topMovers,
      topEngagement,
      trendingUp,
    });
  } catch (error: any) {
    console.error('[API /portal/sentiment] Error:', error);

    // Check for specific Supabase errors
    if (error.message?.includes('configuration missing')) {
      return res.status(503).json({
        ok: false,
        error: 'Sentiment service is not configured',
      });
    }

    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch sentiment data',
    });
  }
}
