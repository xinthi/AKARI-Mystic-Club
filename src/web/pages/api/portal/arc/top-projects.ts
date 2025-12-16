/**
 * API Route: GET /api/portal/arc/top-projects
 * 
 * Returns top projects by growth percentage for a given timeframe.
 * 
 * Query params:
 * - mode: 'gainers' | 'losers' (default: 'gainers')
 * - timeframe: '24h' | '7d' | '30d' | '90d' (default: '7d')
 * - limit: number (default: 20, max: 50)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface TopProject {
  project_id: string;
  name: string;
  twitter_username: string;
  logo_url: string | null;
  growth_pct: number;
  heat: number | null; // ct_heat_score
  slug: string | null; // Project slug for navigation
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  arc_active: boolean;
}

type TopProjectsResponse =
  | {
      ok: true;
      projects: TopProject[];
      mode: 'gainers' | 'losers';
      timeframe: string;
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

/**
 * Get date range for timeframe
 */
function getDateRange(timeframe: string): { startDate: string; endDate: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = today.toISOString().split('T')[0];

  const startDate = new Date(today);
  switch (timeframe) {
    case '24h':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(startDate.getDate() - 90);
      break;
    default:
      startDate.setDate(startDate.getDate() - 7);
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate,
  };
}

/**
 * Calculate growth percentage
 */
function calculateGrowthPct(current: number | null, previous: number | null): number {
  if (current === null || previous === null || previous === 0) {
    return 0;
  }
  return ((current - previous) / previous) * 100;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TopProjectsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Parse and validate query parameters
    const mode = (req.query.mode as string) || 'gainers';
    if (mode !== 'gainers' && mode !== 'losers') {
      return res.status(400).json({ ok: false, error: 'mode must be "gainers" or "losers"' });
    }

    const timeframe = (req.query.timeframe as string) || '7d';
    if (!['24h', '7d', '30d', '90d'].includes(timeframe)) {
      return res.status(400).json({ ok: false, error: 'timeframe must be "24h", "7d", "30d", or "90d"' });
    }

    const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const limit = Math.min(Math.max(limitParam, 1), 50); // Clamp between 1 and 50

    // Get date range
    const { startDate, endDate } = getDateRange(timeframe);

    // Get all active tracked projects with profile_type='project'
    // Optionally filter by is_company=true if needed
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, slug, name, x_handle, avatar_url, twitter_profile_image_url, arc_access_level, arc_active')
      .eq('is_active', true)
      .eq('profile_type', 'project') // Only show projects classified as 'project'
      .neq('slug', 'dev_user'); // Exclude dev_user

    if (projectsError) {
      console.error('[Top Projects API] Error fetching projects:', projectsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch projects' });
    }

    if (!projects || projects.length === 0) {
      return res.status(200).json({
        ok: true,
        projects: [],
        mode,
        timeframe,
      });
    }

    const projectIds = projects.map((p: any) => p.id);

    // Get metrics for start and end dates
    // We'll get the closest available metrics if exact dates don't exist
    // For start date: get metrics <= startDate, ordered by date DESC (most recent before/on start)
    // For end date: get metrics <= endDate, ordered by date DESC (most recent on/before end)
    
    // Get start metrics (closest to startDate, not after)
    const { data: startMetricsRaw, error: startError } = await supabase
      .from('metrics_daily')
      .select('project_id, date, akari_score, ct_heat_score')
      .in('project_id', projectIds)
      .lte('date', startDate)
      .order('date', { ascending: false });

    // Get end metrics (closest to endDate, not after)
    const { data: endMetricsRaw, error: endError } = await supabase
      .from('metrics_daily')
      .select('project_id, date, akari_score, ct_heat_score')
      .in('project_id', projectIds)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (startError || endError) {
      console.error('[Top Projects API] Error fetching metrics:', startError || endError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch metrics' });
    }

    // Create maps for quick lookup (take first entry per project, which is the most recent)
    const startMetricsMap = new Map<string, { akari_score: number | null; ct_heat_score: number | null }>();
    (startMetricsRaw || []).forEach((m: any) => {
      if (!startMetricsMap.has(m.project_id)) {
        startMetricsMap.set(m.project_id, {
          akari_score: m.akari_score,
          ct_heat_score: m.ct_heat_score,
        });
      }
    });

    const endMetricsMap = new Map<string, { akari_score: number | null; ct_heat_score: number | null }>();
    (endMetricsRaw || []).forEach((m: any) => {
      if (!endMetricsMap.has(m.project_id)) {
        endMetricsMap.set(m.project_id, {
          akari_score: m.akari_score,
          ct_heat_score: m.ct_heat_score,
        });
      }
    });

    // Calculate growth for each project
    const projectsWithGrowth: TopProject[] = projects
      .map((p: any) => {
        const startMetric = startMetricsMap.get(p.id);
        const endMetric = endMetricsMap.get(p.id);

        // Use akari_score for growth calculation (primary metric)
        const growthPct = calculateGrowthPct(
          endMetric?.akari_score ?? null,
          startMetric?.akari_score ?? null
        );

        // Get heat from end metric (current heat)
        const heat = endMetric?.ct_heat_score ?? null;

        // Get logo URL (prefer avatar_url, fallback to twitter_profile_image_url)
        const logoUrl = p.avatar_url || p.twitter_profile_image_url || null;

        return {
          project_id: p.id,
          name: p.name || 'Unnamed Project',
          twitter_username: p.x_handle || '',
          logo_url: logoUrl,
          growth_pct: growthPct,
          heat,
          slug: p.slug || null,
          arc_access_level: (p.arc_access_level as 'none' | 'creator_manager' | 'leaderboard' | 'gamified') || 'none',
          arc_active: p.arc_active || false,
        };
      })
      .filter((p) => {
        // Only include projects that have metrics for both start and end dates
        const startMetric = startMetricsMap.get(p.project_id);
        const endMetric = endMetricsMap.get(p.project_id);
        return (
          startMetric?.akari_score !== null &&
          endMetric?.akari_score !== null &&
          startMetric.akari_score > 0
        );
      });

    // Sort by growth_pct
    projectsWithGrowth.sort((a, b) => {
      if (mode === 'gainers') {
        return b.growth_pct - a.growth_pct; // DESC
      } else {
        return a.growth_pct - b.growth_pct; // ASC
      }
    });

    // Apply limit
    const limitedProjects = projectsWithGrowth.slice(0, limit);

    return res.status(200).json({
      ok: true,
      projects: limitedProjects,
      mode,
      timeframe,
    });
  } catch (error: any) {
    console.error('[Top Projects API] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

