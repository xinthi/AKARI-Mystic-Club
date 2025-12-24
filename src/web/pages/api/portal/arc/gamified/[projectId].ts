/**
 * API Route: GET /api/portal/arc/gamified/[projectId]
 * 
 * Option 3: Gamified Leaderboard
 * Extends Option 2 with quests (weekly sprints) inside the main leaderboard.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';

// =============================================================================
// TYPES
// =============================================================================

interface LeaderboardEntry {
  creator_profile_id: string;
  twitter_username: string;
  avatar_url: string | null;
  base_points: number;
  effective_points: number;
  rank: number;
  ring: 'core' | 'momentum' | 'discovery' | null;
  joined_at: string | null;
}

interface Quest {
  id: string;
  project_id: string;
  arena_id: string | null;
  name: string;
  narrative_focus: string | null;
  starts_at: string;
  ends_at: string;
  reward_desc: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Arena {
  id: string;
  name: string;
  slug: string;
}

type GamifiedResponse =
  | { ok: true; arena: Arena | null; entries: LeaderboardEntry[]; quests: Quest[] }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GamifiedResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get projectId from query
    const { projectId } = req.query;
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    const pid: string = projectId;

    // Check ARC access (Option 3 = Gamified Leaderboard)
    const accessCheck = await requireArcAccess(supabase, pid, 3);
    if (!accessCheck.ok) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error,
      });
    }

    // Find active arena for this project
    const { data: activeArena, error: arenaError } = await supabase
      .from('arenas')
      .select('id, name, slug')
      .eq('project_id', pid)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (arenaError) {
      console.error('[ARC Gamified] Error fetching arena:', arenaError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch arena' });
    }

    if (!activeArena) {
      // No active arena - return empty leaderboard and quests
      return res.status(200).json({
        ok: true,
        arena: null,
        entries: [],
        quests: [],
      });
    }

    // Reuse leaderboard query logic from /api/portal/arc/leaderboard/[projectId].ts
    // Get all creators for this arena
    const { data: creators, error: creatorsError } = await supabase
      .from('arena_creators')
      .select('id, profile_id, twitter_username, arc_points, ring, created_at')
      .eq('arena_id', activeArena.id);

    if (creatorsError) {
      console.error('[ARC Gamified] Error fetching creators:', creatorsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch creators' });
    }

    // Get all adjustments for this arena
    const { data: adjustments, error: adjustmentsError } = await supabase
      .from('arc_point_adjustments')
      .select('creator_profile_id, points_delta')
      .eq('arena_id', activeArena.id);

    if (adjustmentsError) {
      console.error('[ARC Gamified] Error fetching adjustments:', adjustmentsError);
      // Continue without adjustments if there's an error
    }

    // Calculate effective_points for each creator
    const adjustmentsMap = new Map<string, number>();
    if (adjustments) {
      for (const adj of adjustments) {
        const profileId = adj.creator_profile_id;
        const current = adjustmentsMap.get(profileId) || 0;
        adjustmentsMap.set(profileId, current + (adj.points_delta || 0));
      }
    }

    // Build entries with effective_points
    const entries: LeaderboardEntry[] = (creators || [])
      .map((creator) => {
        const profileId = creator.profile_id || '';
        const basePoints = creator.arc_points || 0;
        const adjustmentsSum = adjustmentsMap.get(profileId) || 0;
        const effectivePoints = basePoints + adjustmentsSum;

        return {
          creator_profile_id: profileId,
          twitter_username: creator.twitter_username || '',
          avatar_url: null, // Will be populated from profiles if needed
          base_points: basePoints,
          effective_points: effectivePoints,
          rank: 0, // Will be set after sorting
          ring: creator.ring as 'core' | 'momentum' | 'discovery' | null,
          joined_at: creator.created_at || null,
        };
      })
      .filter((entry) => entry.creator_profile_id) // Filter out entries without profile_id
      .sort((a, b) => b.effective_points - a.effective_points) // Sort by effective_points DESC
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    // Fetch avatar URLs from profiles (optional enhancement)
    if (entries.length > 0) {
      const profileIds = entries.map((e) => e.creator_profile_id).filter(Boolean);
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, profile_image_url')
          .in('id', profileIds);

        if (profiles) {
          const avatarMap = new Map<string, string | null>();
          for (const profile of profiles) {
            avatarMap.set(profile.id, profile.profile_image_url || null);
          }

          for (const entry of entries) {
            entry.avatar_url = avatarMap.get(entry.creator_profile_id) || null;
          }
        }
      }
    }

    // Fetch quests for the active arena
    const { data: quests, error: questsError } = await supabase
      .from('arc_quests')
      .select('*')
      .eq('arena_id', activeArena.id)
      .order('created_at', { ascending: false });

    if (questsError) {
      console.error('[ARC Gamified] Error fetching quests:', questsError);
      // Continue without quests if there's an error
    }

    return res.status(200).json({
      ok: true,
      arena: {
        id: activeArena.id,
        name: activeArena.name,
        slug: activeArena.slug,
      },
      entries,
      quests: (quests || []) as Quest[],
    });
  } catch (error: any) {
    console.error('[ARC Gamified] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}










