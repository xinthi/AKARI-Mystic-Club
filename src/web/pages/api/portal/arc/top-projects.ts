/**
 * API Route: GET /api/portal/arc/top-projects
 * 
 * Returns top projects by growth percentage for a given timeframe.
 * 
 * IMPORTANT: This endpoint shows ALL active projects from Sentiment section.
 * - Shows all projects with is_active=true (same as Sentiment section)
 * - Does NOT filter by profile_type or arc_active
 * - ARC leaderboard features (arc_active, arc_access_level) are separate
 *   and only control leaderboard participation, not visibility in treemap
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
  project_id: string;
  name: string;
  twitter_username: string;
  logo_url: string | null;
  growth_pct: number;
  heat: number | null; // ct_heat_score
  slug: string | null; // Project slug for navigation
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  arc_active: boolean;
  profile_type: string;
  is_company: boolean;
}

type TopProjectsResponse =
  | {
      ok: true;
      items: TopProject[];
      lastUpdated: string; // ISO string
      mode: 'gainers' | 'losers';
      timeframe: string;
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

    // Get all active tracked projects (same as Sentiment section)
    // ARC Universe shows ALL projects from Sentiment section
    // ARC leaderboard features (arc_active, arc_access_level) are separate and controlled by SuperAdmin
    // Match the exclusion logic from Sentiment section
    const EXCLUDED_SLUGS = ['dev_user', 'devuser'];
    
    let projects: any[];
    try {
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('id, slug, name, display_name, x_handle, avatar_url, twitter_profile_image_url, arc_access_level, arc_active, profile_type, is_company')
        .eq('is_active', true)
        // Show ALL active projects (same as Sentiment section)
        // ARC leaderboard features are separate and don't affect visibility here
        .order('name', { ascending: true });

      if (projectsError) {
        console.error('[Top Projects API] Error fetching projects:', projectsError);
        return res.status(500).json({
          ok: false,
          error: 'Failed to fetch projects',
          details: projectsError.message,
        });
      }

      // Filter out excluded projects (same as Sentiment section)
      projects = (projectsData || []).filter(
        (p) => !EXCLUDED_SLUGS.includes(p.slug?.toLowerCase())
      );

      console.log(`[Top Projects API] Query result: ${projectsData?.length || 0} total, ${projects.length} after filtering exclusions`);
      
      // Return empty result if no projects (not an error)
      if (projects.length === 0) {
        console.log('[Top Projects API] No active projects found');
        
        // Set cache-control headers to prevent aggressive caching
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        return res.status(200).json({
          ok: true,
          items: [],
          lastUpdated: getCurrentTimestamp(),
          mode,
          timeframe,
        });
      }
      
      console.log(`[Top Projects API] Found ${projects.length} active projects`);
    } catch (fetchError: any) {
      console.error('[Top Projects API] Unexpected error fetching projects:', fetchError);
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
      console.error('[Top Projects API] Error mapping project IDs:', mapError);
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
        .select('project_id, date, akari_score, ct_heat_score')
        .in('project_id', projectIds)
        .lte('date', startDate)
        .order('date', { ascending: false });

      if (startError) {
        console.error('[Top Projects API] Error fetching start metrics:', startError);
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
        .select('project_id, date, akari_score, ct_heat_score')
        .in('project_id', projectIds)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (endError) {
        console.error('[Top Projects API] Error fetching end metrics:', endError);
        return res.status(500).json({
          ok: false,
          error: 'Failed to fetch end metrics',
          details: endError.message,
        });
      }

      endMetricsRaw = endData || [];
    } catch (metricsError: any) {
      console.error('[Top Projects API] Unexpected error fetching metrics:', metricsError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch metrics',
        details: metricsError.message,
      });
    }

    // Create maps for quick lookup (take first entry per project, which is the most recent)
    const startMetricsMap = new Map<string, { akari_score: number | null; ct_heat_score: number | null }>();
    const endMetricsMap = new Map<string, { akari_score: number | null; ct_heat_score: number | null }>();
    
    try {
      (startMetricsRaw || []).forEach((m: any) => {
        if (m && m.project_id && !startMetricsMap.has(m.project_id)) {
          startMetricsMap.set(m.project_id, {
            akari_score: m.akari_score ?? null,
            ct_heat_score: m.ct_heat_score ?? null,
          });
        }
      });

      (endMetricsRaw || []).forEach((m: any) => {
        if (m && m.project_id && !endMetricsMap.has(m.project_id)) {
          endMetricsMap.set(m.project_id, {
            akari_score: m.akari_score ?? null,
            ct_heat_score: m.ct_heat_score ?? null,
          });
        }
      });
    } catch (mapError: any) {
      console.error('[Top Projects API] Error building metrics maps:', mapError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to process metrics',
        details: mapError.message,
      });
    }

    // Calculate growth for each project with error handling
    let projectsWithGrowth: TopProject[];
    try {
      projectsWithGrowth = projects
        .map((p: any) => {
          if (!p || !p.id) {
            throw new Error('Invalid project data in array');
          }

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
            name: p.display_name || p.name || 'Unnamed Project',
            twitter_username: p.x_handle || '',
            logo_url: logoUrl,
            growth_pct: growthPct,
            heat,
            slug: p.slug || null,
            arc_access_level: (p.arc_access_level as 'none' | 'creator_manager' | 'leaderboard' | 'gamified') || 'none',
            arc_active: typeof p.arc_active === 'boolean' ? p.arc_active : false,
            profile_type: p.profile_type || 'project',
            is_company: typeof p.is_company === 'boolean' ? p.is_company : false,
          };
        });
        // Include all projects, even if metrics are missing (growth_pct will be 0)

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

      // Set cache-control headers to prevent aggressive caching
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      return res.status(200).json({
        ok: true,
        items: limitedProjects,
        lastUpdated: getCurrentTimestamp(),
        mode,
        timeframe,
      });
    } catch (calcError: any) {
      console.error('[Top Projects API] Error calculating growth:', calcError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to calculate project growth',
        details: calcError.message,
      });
    }
  } catch (error: any) {
    // Catch-all for any unhandled errors
    console.error('[Top Projects API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
      details: error.stack || undefined,
    });
  }
}

