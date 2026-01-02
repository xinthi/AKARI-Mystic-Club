/**
 * API Route: GET /api/portal/arc/projects/[projectId]/current-ms-arena
 * 
 * Returns the current mindshare arena for a project.
 * 
 * Selection logic:
 * - Live timeframe: starts_at <= now() AND (ends_at is null OR ends_at > now())
 * - Selectable: status='active' AND kind IN ('ms','legacy_ms')
 * - Priority: kind='ms' first, then 'legacy_ms'
 * - Tie break: updated_at desc
 * - LIMIT 1
 * 
 * Example curl usage:
 *   curl -X GET "http://localhost:3000/api/portal/arc/projects/123e4567-e89b-12d3-a456-426614174000/current-ms-arena"
 * 
 * Response:
 *   {
 *     "ok": true,
 *     "projectId": "123e4567-e89b-12d3-a456-426614174000",
 *     "arena": { ... } | null,
 *     "debug": {
 *       "live_active_count": 2,
 *       "live_count": 5,
 *       "active_count": 10
 *     }
 *   }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// =============================================================================
// TYPES
// =============================================================================

type CurrentMsArenaResponse =
  | {
      ok: true;
      projectId: string;
      arena: any | null;
      debug: {
        live_active_count: number;
        live_count: number;
        active_count: number;
        paused_count: number;
        status_counts: Record<string, number>;
        latest_arenas: Array<{
          id: string;
          kind: string | null;
          status: string;
          starts_at: string | null;
          ends_at: string | null;
        }>;
      };
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Validate UUID format
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CurrentMsArenaResponse>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  const { projectId } = req.query;

  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'invalid_project_id',
    });
  }

  // Validate UUID format
  if (!isValidUUID(projectId)) {
    return res.status(400).json({
      ok: false,
      error: 'invalid_project_id',
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    // Verify project is ARC-eligible (is_arc_company = true)
    const { data: projectCheck } = await supabase
      .from('projects')
      .select('id, is_arc_company')
      .eq('id', projectId)
      .single();

    if (!projectCheck || !projectCheck.is_arc_company) {
      return res.status(403).json({
        ok: false,
        error: 'Project is not eligible for ARC',
      });
    }

    // Build the main query: find current MS arena
    // Selection logic:
    // - Live timeframe: starts_at <= now() AND (ends_at is null OR ends_at > now())
    // - Selectable: status IN ('active', 'paused') AND kind IN ('ms','legacy_ms')
    // - Priority: kind='ms' first, then 'legacy_ms'
    // - Tie break: updated_at desc
    // - LIMIT 1

    // First, get diagnostic info: all arenas for this project
    const { data: allArenas } = await supabase
      .from('arenas')
      .select('id, kind, status, starts_at, ends_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(3);

    // Count by status for diagnostics
    const statusCounts: Record<string, number> = {};
    if (allArenas) {
      allArenas.forEach(arena => {
        statusCounts[arena.status] = (statusCounts[arena.status] || 0) + 1;
      });
    }

    // Fetch all candidate arenas (status IN ('active', 'paused')) and filter in JavaScript
    // This handles: starts_at <= now AND (ends_at IS NULL OR ends_at > now)
    const { data: candidates, error: candidatesError } = await supabase
      .from('arenas')
      .select('*')
      .eq('project_id', projectId)
      .in('status', ['active', 'paused'])
      .lte('starts_at', now)
      .order('updated_at', { ascending: false });

    if (candidatesError) {
      console.error('[API /portal/arc/projects/[projectId]/current-ms-arena] Error fetching candidates:', candidatesError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch arena',
      });
    }

    // Filter for live timeframe: ends_at is null OR ends_at > now
    const liveArenas = (candidates || []).filter((arena) => {
      if (!arena.ends_at) return true; // ends_at is null
      return new Date(arena.ends_at) > new Date(now); // ends_at > now
    });

    // Filter by kind: IN ('ms', 'legacy_ms')
    // Check both kind column and settings->>'kind' for flexibility
    const msArenas = liveArenas.filter((arena) => {
      const kind = arena.kind || arena.settings?.kind;
      return kind === 'ms' || kind === 'legacy_ms';
    });

    // Sort by priority: kind='ms' first, then 'legacy_ms', then updated_at desc
    msArenas.sort((a, b) => {
      const aKind = a.kind || a.settings?.kind || '';
      const bKind = b.kind || b.settings?.kind || '';
      
      // Priority: 'ms' > 'legacy_ms'
      if (aKind === 'ms' && bKind !== 'ms') return -1;
      if (aKind !== 'ms' && bKind === 'ms') return 1;
      if (aKind === 'legacy_ms' && bKind !== 'legacy_ms' && bKind !== 'ms') return -1;
      if (aKind !== 'legacy_ms' && bKind === 'legacy_ms' && aKind !== 'ms') return 1;
      
      // Tie break: updated_at desc (already sorted by query, but ensure consistency)
      const aUpdated = new Date(a.updated_at || 0).getTime();
      const bUpdated = new Date(b.updated_at || 0).getTime();
      return bUpdated - aUpdated;
    });

    // Get the first one (LIMIT 1)
    const arenaData = msArenas[0] || null;

    // Debug: Get counts for debugging using count-only queries
    // active_count: status='active' (any kind, any timeframe)
    const { count: activeCount } = await supabase
      .from('arenas')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'active');

    // paused_count: status='paused' (any kind, any timeframe)
    const { count: pausedCount } = await supabase
      .from('arenas')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'paused');

    // live_count: live timeframe (any status, any kind)
    // Because supabase query builder can't do OR easily, do two head-count queries and add them
    const { count: liveNullEnd } = await supabase
      .from('arenas')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .lte('starts_at', now)
      .is('ends_at', null);

    const { count: liveFutureEnd } = await supabase
      .from('arenas')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .lte('starts_at', now)
      .gt('ends_at', now);

    const liveCount = (liveNullEnd || 0) + (liveFutureEnd || 0);

    // live_active_count: same as live_count but with status IN ('active','paused') and kind in ('ms','legacy_ms')
    // Do two head-count queries again (ends_at null vs ends_at > now) and add them
    const { count: liveActiveNullEnd } = await supabase
      .from('arenas')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .in('status', ['active', 'paused'])
      .in('kind', ['ms', 'legacy_ms'])
      .lte('starts_at', now)
      .is('ends_at', null);

    const { count: liveActiveFutureEnd } = await supabase
      .from('arenas')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .in('status', ['active', 'paused'])
      .in('kind', ['ms', 'legacy_ms'])
      .lte('starts_at', now)
      .gt('ends_at', now);

    const liveActiveCount = (liveActiveNullEnd || 0) + (liveActiveFutureEnd || 0);

    // Diagnostic log
    console.log(`[current-ms-arena] Project ${projectId} diagnostics:`, {
      statusCounts,
      latestArenas: allArenas?.map(a => ({
        id: a.id,
        kind: a.kind,
        status: a.status,
        starts_at: a.starts_at,
        ends_at: a.ends_at,
      })),
      liveCount,
      activeCount: activeCount || 0,
      pausedCount: pausedCount || 0,
      liveActiveCount,
      selectedArena: arenaData ? {
        id: arenaData.id,
        kind: arenaData.kind || arenaData.settings?.kind,
        status: arenaData.status,
        starts_at: arenaData.starts_at,
        ends_at: arenaData.ends_at,
      } : null,
    });

    return res.status(200).json({
      ok: true,
      projectId,
      arena: arenaData || null,
      debug: {
        live_active_count: liveActiveCount,
        live_count: liveCount,
        active_count: activeCount || 0,
        paused_count: pausedCount || 0,
        status_counts: statusCounts,
        latest_arenas: allArenas?.map(a => ({
          id: a.id,
          kind: a.kind,
          status: a.status,
          starts_at: a.starts_at,
          ends_at: a.ends_at,
        })) || [],
      },
    });
  } catch (error: any) {
    console.error('[API /portal/arc/projects/[projectId]/current-ms-arena] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
