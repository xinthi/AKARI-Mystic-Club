/**
 * API Route: GET /api/portal/arc/quests/completions
 * 
 * Returns completed mission/quest IDs for the current user for a specific arena.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { requirePortalUser } from '@/lib/server/require-portal-user';

// =============================================================================
// TYPES
// =============================================================================

interface Completion {
  mission_id: string;
  completed_at: string;
}

type CompletionsResponse =
  | { ok: true; completions: Completion[] }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CompletionsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Authentication
    const portalUser = await requirePortalUser(req, res);
    if (!portalUser) {
      return; // requirePortalUser already sent 401 response
    }

    if (!portalUser.profileId) {
      return res.status(400).json({ ok: false, error: 'User profile not found' });
    }

    const supabase = getSupabaseAdmin();

    // Get arenaId from query
    const { arenaId } = req.query;
    if (!arenaId || typeof arenaId !== 'string') {
      return res.status(400).json({ ok: false, error: 'arenaId is required' });
    }

    // Resolve arena.project_id for access check
    const { data: arena, error: arenaError } = await supabase
      .from('arenas')
      .select('id, project_id')
      .eq('id', arenaId)
      .single();

    if (arenaError || !arena) {
      return res.status(404).json({ ok: false, error: 'Arena not found' });
    }

    if (!arena.project_id) {
      return res.status(400).json({ ok: false, error: 'Arena missing project_id' });
    }

    // Check ARC access (Option 3 = Gamified) - quest completions are Option 3 feature
    const accessCheck = await requireArcAccess(supabase, arena.project_id, 3);
    if (!accessCheck.ok) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error,
      });
    }

    // Fetch completed missions for this user and arena
    const { data: completions, error: completionsError } = await supabase
      .from('arc_quest_completions')
      .select('mission_id, completed_at')
      .eq('profile_id', portalUser.profileId)
      .eq('arena_id', arenaId)
      .order('completed_at', { ascending: false });

    if (completionsError) {
      console.error('[ARC Quest Completions] Error fetching completions:', completionsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch completions' });
    }

    return res.status(200).json({
      ok: true,
      completions: (completions || []).map((c) => ({
        mission_id: c.mission_id,
        completed_at: c.completed_at,
      })),
    });
  } catch (error: any) {
    console.error('[ARC Quest Completions] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

