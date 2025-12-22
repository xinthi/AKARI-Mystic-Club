/**
 * API Route: GET /api/portal/arc/leaderboard/[projectId]
 * 
 * Option 2: Normal Leaderboard
 * Returns ranked creators from the active arena for a project, sorted by effective_points.
 * effective_points = base_points (arena_creators.arc_points) + SUM(arc_point_adjustments.points_delta)
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

type LeaderboardResponse =
  | { ok: true; entries: LeaderboardEntry[]; arenaId: string | null; arenaName: string | null }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LeaderboardResponse>
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

    // Check ARC access (Option 2 = Normal Leaderboard)
    const accessCheck = await requireArcAccess(supabase, pid, 2);
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
      console.error('[ARC Leaderboard] Error fetching arena:', arenaError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch arena' });
    }

    if (!activeArena) {
      // No active arena - return empty leaderboard
      return res.status(200).json({
        ok: true,
        entries: [],
        arenaId: null,
        arenaName: null,
      });
    }

    // Get all creators for this arena
    const { data: creators, error: creatorsError } = await supabase
      .from('arena_creators')
      .select('id, profile_id, twitter_username, arc_points, ring, created_at')
      .eq('arena_id', activeArena.id);

    if (creatorsError) {
      console.error('[ARC Leaderboard] Error fetching creators:', creatorsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch creators' });
    }

    if (!creators || creators.length === 0) {
      return res.status(200).json({
        ok: true,
        entries: [],
        arenaId: activeArena.id,
        arenaName: activeArena.name,
      });
    }

    // Get all adjustments for this arena
    const { data: adjustments, error: adjustmentsError } = await supabase
      .from('arc_point_adjustments')
      .select('creator_profile_id, points_delta')
      .eq('arena_id', activeArena.id);

    if (adjustmentsError) {
      console.error('[ARC Leaderboard] Error fetching adjustments:', adjustmentsError);
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
    const entries: LeaderboardEntry[] = creators
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

    return res.status(200).json({
      ok: true,
      entries,
      arenaId: activeArena.id,
      arenaName: activeArena.name,
    });
  } catch (error: any) {
    console.error('[ARC Leaderboard] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
