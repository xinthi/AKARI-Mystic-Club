/**
 * API Route: GET /api/portal/arc/pulse
 * 
 * Campaign Pulse metrics for founder dashboard
 * Returns aggregate metrics only (no private creator data)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { requirePortalUser } from '@/lib/server/require-portal-user';

// =============================================================================
// TYPES
// =============================================================================

interface PulseResponse {
  ok: boolean;
  metrics?: {
    creatorsParticipating: number;
    totalCompletions: number | null; // null if Option 3 not unlocked
    topCreatorScore: number | null;
  };
  error?: string;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PulseResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const user = await requirePortalUser(req, res);
    if (!user) return; // requirePortalUser already sent response

    const { projectId } = req.query;
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    const pid: string = projectId;

    // Check ARC access (Option 2 at minimum for basic metrics)
    const accessCheck = await requireArcAccess(supabase, pid, 2);
    if (!accessCheck.ok) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error || 'ARC access not approved for this project',
      });
    }

    // Find active arena for this project
    const { data: activeArena, error: arenaError } = await supabase
      .from('arenas')
      .select('id')
      .eq('project_id', pid)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (arenaError) {
      console.error('[ARC Pulse] Error fetching arena:', arenaError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch arena' });
    }

    if (!activeArena) {
      // No active arena - return zeros
      return res.status(200).json({
        ok: true,
        metrics: {
          creatorsParticipating: 0,
          totalCompletions: null,
          topCreatorScore: null,
        },
      });
    }

    // Metric 1: Creators participating (count arena_creators)
    const { count: creatorsCount, error: creatorsError } = await supabase
      .from('arena_creators')
      .select('*', { count: 'exact', head: true })
      .eq('arena_id', activeArena.id);

    if (creatorsError) {
      console.error('[ARC Pulse] Error counting creators:', creatorsError);
      return res.status(500).json({ ok: false, error: 'Unable to load creator data. Please try again later.' });
    }

    // Metric 2: Total completions (Option 3 only)
    let totalCompletions: number | null = null;
    const option3Check = await requireArcAccess(supabase, pid, 3);
    if (option3Check.ok) {
      const { count: completionsCount, error: completionsError } = await supabase
        .from('arc_quest_completions')
        .select('*', { count: 'exact', head: true })
        .eq('arena_id', activeArena.id);

      if (completionsError) {
        console.error('[ARC Pulse] Error counting completions:', completionsError);
        // Don't fail - just set to null
      } else {
        totalCompletions = completionsCount || 0;
      }
    }

    // Metric 3: Top creator score (from leaderboard data)
    let topCreatorScore: number | null = null;
    const { data: topCreator, error: topCreatorError } = await supabase
      .from('arena_creators')
      .select('arc_points')
      .eq('arena_id', activeArena.id)
      .order('arc_points', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (topCreatorError) {
      console.error('[ARC Pulse] Error fetching top creator:', topCreatorError);
      // Don't fail - just set to null
    } else if (topCreator) {
      topCreatorScore = topCreator.arc_points || 0;
    }

    return res.status(200).json({
      ok: true,
      metrics: {
        creatorsParticipating: creatorsCount || 0,
        totalCompletions,
        topCreatorScore,
      },
    });
  } catch (error: any) {
    console.error('[ARC Pulse] Error:', error);
    return res.status(500).json({ ok: false, error: 'Unable to load pulse data. Please try again later.' });
  }
}

