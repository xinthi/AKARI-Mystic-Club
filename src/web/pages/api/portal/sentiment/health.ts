/**
 * API Route: GET /api/portal/sentiment/health
 * 
 * Returns coverage and data health metrics for sentiment tracking.
 * No authentication required (same as /api/portal/sentiment main route).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { classifyFreshness } from '@/lib/portal/data-freshness';

// =============================================================================
// TYPES
// =============================================================================

interface SentimentHealthData {
  totalProjects: number;
  totalWithMetrics: number;
  totalNoData: number;
  freshCount: number;
  warmCount: number;
  staleCount: number;
  withInnerCircleCount: number;
  lastGlobalUpdatedAt: string | null;
}

type SentimentHealthResponse =
  | {
      ok: true;
      data: SentimentHealthData;
    }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SentimentHealthResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Use read-only client for queries (no auth required, same as main sentiment route)
    const supabase = createPortalClient();

    // 1. Load active projects
    const { data: activeProjects, error: projectsError } = await supabase
      .from('projects')
      .select('id')
      .eq('is_active', true)
      .neq('slug', 'dev_user'); // Exclude dev_user like in the overview

    if (projectsError) {
      console.error('[Sentiment Health API] Error fetching projects:', projectsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch projects' });
    }

    const totalProjects = activeProjects?.length ?? 0;
    const projectIds = activeProjects?.map((p) => p.id) ?? [];

    if (totalProjects === 0) {
      return res.status(200).json({
        ok: true,
        data: {
          totalProjects: 0,
          totalWithMetrics: 0,
          totalNoData: 0,
          freshCount: 0,
          warmCount: 0,
          staleCount: 0,
          withInnerCircleCount: 0,
          lastGlobalUpdatedAt: null,
        },
      });
    }

    // 2. Get latest metrics_daily row per project
    const { data: allMetrics, error: metricsError } = await supabase
      .from('metrics_daily')
      .select('project_id, updated_at, created_at, date')
      .in('project_id', projectIds)
      .order('date', { ascending: false });

    if (metricsError) {
      console.error('[Sentiment Health API] Error fetching metrics:', metricsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch metrics' });
    }

    // Build map of latest metrics per project
    const latestMetricsByProject = new Map<string, {
      updated_at: string | null;
      created_at: string | null;
      date: string | null;
    }>();

    if (allMetrics) {
      for (const m of allMetrics) {
        if (!latestMetricsByProject.has(m.project_id)) {
          latestMetricsByProject.set(m.project_id, {
            updated_at: m.updated_at,
            created_at: m.created_at,
            date: m.date,
          });
        }
      }
    }

    // 3. Classify freshness for each project
    let totalWithMetrics = 0;
    let totalNoData = 0;
    let freshCount = 0;
    let warmCount = 0;
    let staleCount = 0;
    let lastGlobalUpdatedAt: string | null = null;

    for (const projectId of projectIds) {
      const latestMetrics = latestMetricsByProject.get(projectId);
      
      if (!latestMetrics) {
        totalNoData++;
        continue;
      }

      totalWithMetrics++;
      
      // Determine lastUpdatedAt: updated_at || created_at (NOT date, as date is the metrics date, not update time)
      const lastUpdatedAt = latestMetrics.updated_at ?? latestMetrics.created_at;
      
      if (lastUpdatedAt) {
        // Track max lastUpdatedAt for global timestamp (use updated_at first, then created_at)
        const timestampForGlobal = latestMetrics.updated_at ?? latestMetrics.created_at;
        if (timestampForGlobal && (!lastGlobalUpdatedAt || timestampForGlobal > lastGlobalUpdatedAt)) {
          lastGlobalUpdatedAt = timestampForGlobal;
        }

        // Classify freshness based on actual update time
        const freshness = classifyFreshness(lastUpdatedAt);
        
        if (freshness.label === 'Fresh') {
          freshCount++;
        } else if (freshness.label === 'Warm') {
          warmCount++;
        } else {
          staleCount++;
        }
      } else {
        // No valid timestamp (neither updated_at nor created_at), treat as no data
        totalNoData++;
        totalWithMetrics--;
      }
    }

    // 4. Count projects with inner circle data
    const { data: projectsWithInnerCircle, error: innerCircleError } = await supabase
      .from('project_inner_circle')
      .select('project_id')
      .in('project_id', projectIds);

    if (innerCircleError) {
      console.error('[Sentiment Health API] Error fetching inner circle:', innerCircleError);
      // Don't fail the whole request, just set count to 0
    }

    const uniqueProjectsWithInnerCircle = new Set(
      projectsWithInnerCircle?.map((r) => r.project_id) ?? []
    );
    const withInnerCircleCount = uniqueProjectsWithInnerCircle.size;

    return res.status(200).json({
      ok: true,
      data: {
        totalProjects,
        totalWithMetrics,
        totalNoData,
        freshCount,
        warmCount,
        staleCount,
        withInnerCircleCount,
        lastGlobalUpdatedAt,
      },
    });
  } catch (error: any) {
    console.error('[Sentiment Health API] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

