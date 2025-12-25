/**
 * API Route: GET /api/portal/arc/live-leaderboards
 * 
 * Returns active arenas (live leaderboards) with project information.
 * Limited to 10-20 results.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';

// =============================================================================
// TYPES
// =============================================================================

interface LiveLeaderboard {
  arenaId: string;
  arenaName: string;
  arenaSlug: string;
  projectId: string;
  projectName: string;
  projectSlug: string | null;
  xHandle: string | null;
  creatorCount: number;
  startAt: string | null;
  endAt: string | null;
}

type LiveLeaderboardsResponse =
  | { ok: true; leaderboards: LiveLeaderboard[]; upcoming: LiveLeaderboard[] }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LiveLeaderboardsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get limit from query (default 15)
    const limit = Math.min(parseInt(req.query.limit as string) || 15, 20);

    // Get active arenas with project info
    const { data: arenas, error: arenasError } = await supabase
      .from('arenas')
      .select(`
        id,
        name,
        slug,
        project_id,
        projects:project_id (
          id,
          name,
          slug,
          x_handle
        )
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (arenasError) {
      console.error('[Live Leaderboards] Error fetching arenas:', arenasError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch leaderboards' });
    }

    if (!arenas || arenas.length === 0) {
      return res.status(200).json({ ok: true, leaderboards: [] });
    }

    // Get creator counts for each arena
    const arenaIds = arenas.map(a => a.id);
    const { data: creatorCounts, error: countsError } = await supabase
      .from('arena_creators')
      .select('arena_id')
      .in('arena_id', arenaIds);

    if (countsError) {
      console.error('[Live Leaderboards] Error fetching creator counts:', countsError);
      // Continue without counts
    }

    // Build counts map
    const countsMap = new Map<string, number>();
    if (creatorCounts) {
      for (const cc of creatorCounts) {
        const current = countsMap.get(cc.arena_id) || 0;
        countsMap.set(cc.arena_id, current + 1);
      }
    }

    // Get arc_project_features for projects to check date ranges
    const projectIds = [...new Set(arenas.map((a: any) => a.projects?.id).filter(Boolean))];
    const { data: projectFeatures, error: featuresError } = await supabase
      .from('arc_project_features')
      .select('project_id, leaderboard_enabled, leaderboard_start_at, leaderboard_end_at')
      .in('project_id', projectIds);

    const featuresMap = new Map<string, any>();
    if (projectFeatures) {
      projectFeatures.forEach((f: any) => {
        featuresMap.set(f.project_id, f);
      });
    }

    // Filter arenas where project has Option 2 unlocked and build response
    const leaderboards: LiveLeaderboard[] = [];
    const upcoming: LiveLeaderboard[] = [];
    const now = new Date();

    for (const arena of arenas) {
      const project = arena.projects as any;
      if (!project || !project.id) continue;

      // Check if project has Option 2 unlocked
      const accessCheck = await requireArcAccess(supabase, project.id, 2);
      if (!accessCheck.ok) {
        // Skip if Option 2 not unlocked
        continue;
      }

      // Get date range from arc_project_features
      const features = featuresMap.get(project.id);
      const startAt = features?.leaderboard_start_at || null;
      const endAt = features?.leaderboard_end_at || null;

      const leaderboard: LiveLeaderboard = {
        arenaId: arena.id,
        arenaName: arena.name,
        arenaSlug: arena.slug,
        projectId: project.id,
        projectName: project.name || 'Unknown',
        projectSlug: project.slug,
        xHandle: project.x_handle,
        creatorCount: countsMap.get(arena.id) || 0,
        startAt,
        endAt,
      };

      // Determine if it's live or upcoming
      if (startAt && endAt) {
        const startDate = new Date(startAt);
        const endDate = new Date(endAt);
        
        // If start date is in future, it's upcoming
        if (startDate > now) {
          upcoming.push(leaderboard);
        } 
        // If current time is within range, it's live
        else if (now >= startDate && now <= endDate) {
          leaderboards.push(leaderboard);
        }
        // If past end date, skip (not shown)
      } else {
        // No dates set - treat as always active (live)
        leaderboards.push(leaderboard);
      }
    }

    return res.status(200).json({ ok: true, leaderboards, upcoming });
  } catch (error: any) {
    console.error('[Live Leaderboards] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

