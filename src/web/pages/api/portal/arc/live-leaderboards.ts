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
}

type LiveLeaderboardsResponse =
  | { ok: true; leaderboards: LiveLeaderboard[] }
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

    // Filter arenas where project has Option 2 unlocked and build response
    const leaderboards: LiveLeaderboard[] = [];

    for (const arena of arenas) {
      const project = arena.projects as any;
      if (!project || !project.id) continue;

      // Check if project has Option 2 unlocked
      const accessCheck = await requireArcAccess(supabase, project.id, 2);
      if (!accessCheck.ok) {
        // Skip if Option 2 not unlocked
        continue;
      }

      leaderboards.push({
        arenaId: arena.id,
        arenaName: arena.name,
        arenaSlug: arena.slug,
        projectId: project.id,
        projectName: project.name || 'Unknown',
        projectSlug: project.slug,
        xHandle: project.x_handle,
        creatorCount: countsMap.get(arena.id) || 0,
      });
    }

    return res.status(200).json({ ok: true, leaderboards });
  } catch (error: any) {
    console.error('[Live Leaderboards] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

