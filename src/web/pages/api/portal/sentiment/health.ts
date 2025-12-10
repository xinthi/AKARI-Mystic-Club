/**
 * API Route: GET /api/portal/sentiment/health
 * 
 * Returns coverage and data health metrics for sentiment tracking.
 * Requires user to be logged in (same as /portal/sentiment page).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
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
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

async function checkUserLoggedIn(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string): Promise<boolean> {
  const { data: session, error } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (error || !session) {
    return false;
  }

  // Check if session is expired
  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    return false;
  }

  return true;
}

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

  // Check authentication (user must be logged in)
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Verify session is valid
    const isLoggedIn = await checkUserLoggedIn(supabaseAdmin, sessionToken);
    if (!isLoggedIn) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired session' });
    }

    // Use read-only client for queries
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
      
      // Determine lastUpdatedAt: updated_at || created_at || date
      const lastUpdatedAt = latestMetrics.updated_at ?? latestMetrics.created_at ?? latestMetrics.date;
      
      if (lastUpdatedAt) {
        // Track max lastUpdatedAt for global timestamp
        if (!lastGlobalUpdatedAt || lastUpdatedAt > lastGlobalUpdatedAt) {
          lastGlobalUpdatedAt = lastUpdatedAt;
        }

        // Classify freshness
        const freshness = classifyFreshness(lastUpdatedAt);
        
        if (freshness.label === 'Fresh') {
          freshCount++;
        } else if (freshness.label === 'Warm') {
          warmCount++;
        } else {
          staleCount++;
        }
      } else {
        // No valid timestamp, treat as no data
        totalNoData++;
        totalWithMetrics--;
      }
    }

    // 4. Count projects with inner circle data
    const { data: projectsWithInnerCircle, error: innerCircleError } = await supabase
      .from('project_influencers')
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

