/**
 * API Route: GET /api/portal/arc/top-projects
 * 
 * Returns top projects by growth percentage for a given timeframe.
 * 
 * IMPORTANT: This endpoint ONLY includes projects where profile_type = 'project'.
 * - profile_type = 'project' is the ONLY inclusion rule
 * - Does NOT filter by arc_active or arc_access_level for inclusion
 * - If metrics are missing, growth_pct = 0 (project is NOT dropped)
 * 
 * Query params:
 * - mode: 'gainers' | 'losers' (default: 'gainers')
 * - timeframe: '24h' | '7d' | '30d' | '90d' (default: '7d')
 * - limit: number (default: 20, max: 50)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface TopProject {
  id: string;
  display_name: string;
  twitter_username: string;
  growth_pct: number;
  arc_active: boolean;
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
}

type TopProjectsResponse =
  | {
      ok: true;
      items: TopProject[];
      lastUpdated: string; // ISO string
    }
  | { ok: false; error: string; details?: string };

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get current timestamp as ISO string
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
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
  // Wrap entire handler in try/catch to catch any unhandled errors
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    // This is a read-only public endpoint - no auth required
    // Use portal client (anon key) for public read access
    let supabase;
    try {
      supabase = createPortalClient();
    } catch (configError: any) {
      console.error('[Top Projects API] Configuration error:', configError);
      return res.status(500).json({
        ok: false,
        error: 'Server configuration error',
        details: configError.message,
      });
    }

    // Parse and validate query parameters with error handling
    let mode: 'gainers' | 'losers';
    try {
      const modeParam = (req.query.mode as string) || 'gainers';
      if (modeParam !== 'gainers' && modeParam !== 'losers') {
        return res.status(400).json({ ok: false, error: 'mode must be "gainers" or "losers"' });
      }
      mode = modeParam;
    } catch (paramError: any) {
      console.error('[Top Projects API] Error parsing mode:', paramError);
      return res.status(400).json({
        ok: false,
        error: 'Invalid mode parameter',
        details: paramError.message,
      });
    }

    let timeframe: '24h' | '7d' | '30d' | '90d';
    try {
      const timeframeParam = (req.query.timeframe as string) || '7d';
      if (!['24h', '7d', '30d', '90d'].includes(timeframeParam)) {
        return res.status(400).json({ ok: false, error: 'timeframe must be "24h", "7d", "30d", or "90d"' });
      }
      timeframe = timeframeParam as '24h' | '7d' | '30d' | '90d';
    } catch (paramError: any) {
      console.error('[Top Projects API] Error parsing timeframe:', paramError);
      return res.status(400).json({
        ok: false,
        error: 'Invalid timeframe parameter',
        details: paramError.message,
      });
    }

    let limit: number;
    try {
      const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      if (isNaN(limitParam)) {
        return res.status(400).json({ ok: false, error: 'limit must be a number' });
      }
      limit = Math.min(Math.max(limitParam, 1), 50); // Clamp between 1 and 50
    } catch (paramError: any) {
      console.error('[Top Projects API] Error parsing limit:', paramError);
      return res.status(400).json({
        ok: false,
        error: 'Invalid limit parameter',
        details: paramError.message,
      });
    }

    // Get date range with error handling
    let startDate: string;
    let endDate: string;
    try {
      const dateRange = getDateRange(timeframe);
      startDate = dateRange.startDate;
      endDate = dateRange.endDate;
    } catch (dateError: any) {
      console.error('[Top Projects API] Error calculating date range:', dateError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to calculate date range',
        details: dateError.message,
      });
    }

    // Get projects where profile_type = 'project' (ONLY inclusion rule)
    // Do NOT filter by arc_active or arc_access_level for inclusion
    let projects: any[];
    try {
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('id, display_name, x_handle, arc_access_level, arc_active, profile_type')
        .eq('is_active', true)
        .eq('profile_type', 'project')
        .order('name', { ascending: true });

      if (projectsError) {
        console.error('[ARC top-projects] Error fetching projects:', projectsError);
        return res.status(500).json({
          ok: false,
          error: 'Failed to fetch projects',
          details: projectsError.message,
        });
      }

      projects = projectsData || [];

      console.log(`[ARC top-projects] Found ${projects.length} projects with profile_type='project'`);
      
      // Return empty result if no projects (not an error)
      if (projects.length === 0) {
        console.log('[ARC top-projects] No projects found with profile_type=\'project\'');
        
        // Set cache-control headers to prevent aggressive caching
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        return res.status(200).json({
          ok: true,
          items: [],
          lastUpdated: getCurrentTimestamp(),
        });
      }
    } catch (fetchError: any) {
      console.error('[ARC top-projects] Unexpected error fetching projects:', fetchError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch projects',
        details: fetchError.message,
      });
    }

    // Get project IDs with error handling
    let projectIds: string[];
    try {
      projectIds = projects.map((p: any) => {
        if (!p || !p.id) {
          throw new Error('Invalid project data: missing id');
        }
        return p.id;
      });
    } catch (mapError: any) {
      console.error('[ARC top-projects] Error mapping project IDs:', mapError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to process projects',
        details: mapError.message,
      });
    }

    // Get metrics for start and end dates
    // We'll get the closest available metrics if exact dates don't exist
    // For start date: get metrics <= startDate, ordered by date DESC (most recent before/on start)
    // For end date: get metrics <= endDate, ordered by date DESC (most recent on/before end)
    let startMetricsRaw: any[];
    let endMetricsRaw: any[];
    
    try {
      // Get start metrics (closest to startDate, not after)
      const { data: startData, error: startError } = await supabase
        .from('metrics_daily')
        .select('project_id, date, akari_score')
        .in('project_id', projectIds)
        .lte('date', startDate)
        .order('date', { ascending: false });

      if (startError) {
        console.error('[ARC top-projects] Error fetching start metrics:', startError);
        return res.status(500).json({
          ok: false,
          error: 'Failed to fetch start metrics',
          details: startError.message,
        });
      }

      startMetricsRaw = startData || [];

      // Get end metrics (closest to endDate, not after)
      const { data: endData, error: endError } = await supabase
        .from('metrics_daily')
        .select('project_id, date, akari_score')
        .in('project_id', projectIds)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (endError) {
        console.error('[ARC top-projects] Error fetching end metrics:', endError);
        return res.status(500).json({
          ok: false,
          error: 'Failed to fetch end metrics',
          details: endError.message,
        });
      }

      endMetricsRaw = endData || [];
    } catch (metricsError: any) {
      console.error('[ARC top-projects] Unexpected error fetching metrics:', metricsError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch metrics',
        details: metricsError.message,
      });
    }

    // Create maps for quick lookup (take first entry per project, which is the most recent)
    const startMetricsMap = new Map<string, number | null>();
    const endMetricsMap = new Map<string, number | null>();
    
    try {
      (startMetricsRaw || []).forEach((m: any) => {
        if (m && m.project_id && !startMetricsMap.has(m.project_id)) {
          startMetricsMap.set(m.project_id, m.akari_score ?? null);
        }
      });

      (endMetricsRaw || []).forEach((m: any) => {
        if (m && m.project_id && !endMetricsMap.has(m.project_id)) {
          endMetricsMap.set(m.project_id, m.akari_score ?? null);
        }
      });
    } catch (mapError: any) {
      console.error('[ARC top-projects] Error building metrics maps:', mapError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to process metrics',
        details: mapError.message,
      });
    }

    // Calculate growth for each project with error handling
    // If metrics are missing, set growth_pct = 0 (do NOT drop the project)
    let projectsWithGrowth: TopProject[];
    try {
      projectsWithGrowth = projects
        .map((p: any) => {
          if (!p || !p.id) {
            throw new Error('Invalid project data in array');
          }

          const startAkariScore = startMetricsMap.get(p.id) ?? null;
          const endAkariScore = endMetricsMap.get(p.id) ?? null;

          // Calculate growth_pct (if metrics missing, growth_pct = 0)
          const growthPct = calculateGrowthPct(endAkariScore, startAkariScore);

          return {
            id: p.id,
            display_name: p.display_name || 'Unnamed Project',
            twitter_username: p.x_handle || '',
            growth_pct: growthPct,
            arc_active: typeof p.arc_active === 'boolean' ? p.arc_active : false,
            arc_access_level: (p.arc_access_level as 'none' | 'creator_manager' | 'leaderboard' | 'gamified') || 'none',
          };
        });
        // Include all projects, even if metrics are missing (growth_pct will be 0)

      // Sort by growth_pct
      // gainers: growth_pct desc
      // losers: growth_pct asc
      projectsWithGrowth.sort((a, b) => {
        if (mode === 'gainers') {
          return b.growth_pct - a.growth_pct; // DESC
        } else {
          return a.growth_pct - b.growth_pct; // ASC
        }
      });

      // Return top 20 (or limit)
      const limitedProjects = projectsWithGrowth.slice(0, limit);

      // Set cache-control headers to prevent aggressive caching
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      return res.status(200).json({
        ok: true,
        items: limitedProjects,
        lastUpdated: getCurrentTimestamp(),
      });
    } catch (calcError: any) {
      console.error('[ARC top-projects] Error calculating growth:', calcError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to calculate project growth',
        details: calcError.message,
      });
    }
  } catch (error: any) {
    // Catch-all for any unhandled errors
    console.error('[ARC top-projects] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
      details: error.stack || undefined,
    });
  }
}

