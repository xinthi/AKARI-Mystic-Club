/**
 * API Route: GET /api/portal/arc/quests/recent-activity?arenaId=...
 * 
 * Returns recent quest completions for an arena (last 20).
 * Gated by requireArcAccess Option 3 (Gamified).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { requirePortalUser } from '@/lib/server/require-portal-user';

// =============================================================================
// TYPES
// =============================================================================

interface RecentActivityItem {
  mission_id: string;
  completed_at: string;
  creator_username: string;
  proof_url: string | null;
}

type RecentActivityResponse =
  | { ok: true; activities: RecentActivityItem[] }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RecentActivityResponse>
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

    // Check ARC Option 3 access (Gamified) - recent activity is Option 3 feature
    const accessCheck = await requireArcAccess(supabase, arena.project_id, 3);
    if (!accessCheck.ok) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error,
      });
    }

    // Fetch recent completions with creator usernames
    const { data: completions, error: completionsError } = await supabase
      .from('arc_quest_completions')
      .select(`
        mission_id,
        completed_at,
        proof_url,
        profile_id,
        profiles!inner(
          username
        )
      `)
      .eq('arena_id', arenaId)
      .order('completed_at', { ascending: false })
      .limit(20);

    if (completionsError) {
      console.error('[ARC Recent Activity] Error fetching completions:', completionsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch recent activity' });
    }

    // Map to response format (minimal safe fields)
    const activities: RecentActivityItem[] = (completions || []).map((item: any) => ({
      mission_id: item.mission_id,
      completed_at: item.completed_at,
      creator_username: item.profiles?.username || 'unknown',
      proof_url: item.proof_url || null,
    }));

    return res.status(200).json({
      ok: true,
      activities,
    });
  } catch (error: any) {
    console.error('[ARC Recent Activity] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

