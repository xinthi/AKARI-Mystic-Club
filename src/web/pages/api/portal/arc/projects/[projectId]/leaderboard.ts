/**
 * API Route: GET /api/portal/arc/projects/[projectId]/leaderboard
 * 
 * Returns top 100 creators ranked by total ARC points across all programs for a project.
 * Only works for projects with arc_access_level in ('leaderboard', 'gamified').
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { calculateLevel } from '@/lib/creator-gamification';

// =============================================================================
// TYPES
// =============================================================================

interface LeaderboardEntry {
  creator_profile_id: string;
  twitter_username: string;
  avatar_url: string | null;
  total_arc_points: number;
  xp: number;
  level: number;
  class: string | null;
}

type LeaderboardResponse =
  | { ok: true; entries: LeaderboardEntry[] }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

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

    // Verify project exists and has leaderboard/gamified access
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, arc_access_level')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    if (project.arc_access_level !== 'leaderboard' && project.arc_access_level !== 'gamified') {
      return res.status(400).json({
        ok: false,
        error: 'Project does not have leaderboard access enabled',
      });
    }

    // Get all programs for this project
    const { data: programs, error: programsError } = await supabase
      .from('creator_manager_programs')
      .select('id')
      .eq('project_id', projectId)
      .eq('status', 'active');

    if (programsError) {
      console.error('[ARC Leaderboard] Error fetching programs:', programsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch programs' });
    }

    if (!programs || programs.length === 0) {
      return res.status(200).json({ ok: true, entries: [] });
    }

    const programIds = programs.map((p: any) => p.id);

    // Get all creators across all programs for this project
    // Aggregate arc_points and xp, get most recent class
    const { data: creators, error: creatorsError } = await supabase
      .from('creator_manager_creators')
      .select(`
        creator_profile_id,
        arc_points,
        xp,
        class,
        updated_at,
        profiles:creator_profile_id (
          username,
          profile_image_url
        )
      `)
      .in('program_id', programIds)
      .in('status', ['approved', 'pending']); // Include both approved and pending

    if (creatorsError) {
      console.error('[ARC Leaderboard] Error fetching creators:', creatorsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch creators' });
    }

    if (!creators || creators.length === 0) {
      return res.status(200).json({ ok: true, entries: [] });
    }

    // Aggregate by creator_profile_id
    const creatorMap = new Map<string, {
      creator_profile_id: string;
      total_arc_points: number;
      total_xp: number;
      class: string | null;
      latest_updated_at: string;
      profile: {
        username: string;
        profile_image_url: string | null;
      } | null;
    }>();

    for (const creator of creators) {
      const profileId = creator.creator_profile_id;
      const existing = creatorMap.get(profileId);

      const profile = Array.isArray(creator.profiles) 
        ? creator.profiles[0] 
        : creator.profiles;

      if (existing) {
        existing.total_arc_points += creator.arc_points || 0;
        existing.total_xp += creator.xp || 0;
        // Use most recent class (by updated_at)
        if (creator.updated_at > existing.latest_updated_at) {
          existing.class = creator.class;
          existing.latest_updated_at = creator.updated_at;
        }
      } else {
        creatorMap.set(profileId, {
          creator_profile_id: profileId,
          total_arc_points: creator.arc_points || 0,
          total_xp: creator.xp || 0,
          class: creator.class,
          latest_updated_at: creator.updated_at,
          profile: profile ? {
            username: profile.username,
            profile_image_url: profile.profile_image_url,
          } : null,
        });
      }
    }

    // Convert to array and sort
    const entries: LeaderboardEntry[] = Array.from(creatorMap.values())
      .map((entry) => ({
        creator_profile_id: entry.creator_profile_id,
        twitter_username: entry.profile?.username || '',
        avatar_url: entry.profile?.profile_image_url || null,
        total_arc_points: entry.total_arc_points,
        xp: entry.total_xp,
        level: calculateLevel(entry.total_xp),
        class: entry.class,
      }))
      .sort((a, b) => {
        // Primary sort: total_arc_points descending
        if (a.total_arc_points !== b.total_arc_points) {
          return b.total_arc_points - a.total_arc_points;
        }
        // Tie-breaker: xp descending
        return b.xp - a.xp;
      })
      .slice(0, 100); // Top 100

    return res.status(200).json({ ok: true, entries });
  } catch (error: any) {
    console.error('[ARC Leaderboard] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

