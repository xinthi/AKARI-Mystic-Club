/**
 * API Route: GET /api/portal/arc/arenas/[slug]
 * 
 * Returns detailed arena data including:
 * - Arena info (id, slug, name, description, status, starts_at, ends_at, reward_depth, settings)
 * - Project info (id, name, twitter_username, avatar_url)
 * - Creators list ordered by arc_points DESC
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface ArenaDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';
  starts_at: string | null;
  ends_at: string | null;
  reward_depth: number;
  settings: Record<string, any>;
}

interface ProjectInfo {
  id: string;
  name: string;
  twitter_username: string;
  avatar_url: string | null;
}

interface Creator {
  id: string;
  twitter_username: string;
  arc_points: number;
  adjusted_points: number;
  ring: 'core' | 'momentum' | 'discovery';
  style: string | null;
  meta: Record<string, any>;
}

type ArenaDetailResponse =
  | {
      ok: true;
      arena: ArenaDetail;
      project: ProjectInfo;
      creators: Creator[];
      sentiment: {
        enabled: boolean;
        summary: null;
        series: any[];
      };
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ArenaDetailResponse>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Arena slug is required',
    });
  }

  try {
    // Create Supabase client (read-only with anon key)
    const supabase = createPortalClient();

    // Look up arena by slug with project join
    const { data: arenaData, error: arenaError } = await supabase
      .from('arenas')
      .select(`
        id,
        slug,
        name,
        description,
        status,
        starts_at,
        ends_at,
        reward_depth,
        settings,
        project_id,
        projects (
          id,
          name,
          x_handle,
          avatar_url
        )
      `)
      .eq('slug', slug)
      .single();

    if (arenaError) {
      // Check if it's a "not found" error (PGRST116 is the code for no rows)
      if (arenaError.code === 'PGRST116') {
        return res.status(404).json({
          ok: false,
          error: 'Arena not found',
        });
      }

      console.error('[API /portal/arc/arenas/[slug]] Supabase error fetching arena:', arenaError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch arena',
      });
    }

    if (!arenaData) {
      return res.status(404).json({
        ok: false,
        error: 'Arena not found',
      });
    }

    // Extract project info (handle nested structure from join)
    const project = (arenaData as any).projects;
    if (!project) {
      console.error('[API /portal/arc/arenas/[slug]] Project not found for arena');
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch arena project',
      });
    }

    // Query arena_creators for this arena, ordered by arc_points DESC
    const { data: creatorsData, error: creatorsError } = await supabase
      .from('arena_creators')
      .select('id, twitter_username, arc_points, ring, style, meta, profile_id')
      .eq('arena_id', arenaData.id)
      .order('arc_points', { ascending: false });

    // Get profile_ids for creators (filter out nulls)
    const creatorProfileIds = (creatorsData || [])
      .map((c: any) => c.profile_id)
      .filter((id: any) => id !== null && id !== undefined);

    if (creatorsError) {
      console.error('[API /portal/arc/arenas/[slug]] Supabase error fetching creators:', creatorsError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch arena creators',
      });
    }

    // Fetch point adjustments for all creators in this arena
    let adjustmentsMap: Record<string, number> = {};

    if (creatorProfileIds.length > 0) {
      const { data: adjustmentsData } = await supabase
        .from('arc_point_adjustments')
        .select('creator_profile_id, points_delta')
        .eq('arena_id', arenaData.id)
        .in('creator_profile_id', creatorProfileIds);

      if (adjustmentsData) {
        // Sum adjustments per creator
        for (const adj of adjustmentsData) {
          const creatorId = adj.creator_profile_id;
          adjustmentsMap[creatorId] = (adjustmentsMap[creatorId] || 0) + Number(adj.points_delta);
        }
      }
    }

    // Build response with adjusted points
    const response: ArenaDetailResponse = {
      ok: true,
      arena: {
        id: arenaData.id,
        slug: arenaData.slug,
        name: arenaData.name,
        description: arenaData.description,
        status: arenaData.status,
        starts_at: arenaData.starts_at,
        ends_at: arenaData.ends_at,
        reward_depth: arenaData.reward_depth,
        settings: arenaData.settings || {},
      },
      project: {
        id: project.id,
        name: project.name,
        twitter_username: project.x_handle || '',
        avatar_url: project.avatar_url || null,
      },
      creators: (creatorsData || []).map((creator: any) => {
        const basePoints = Number(creator.arc_points);
        const adjustment = creator.profile_id ? (adjustmentsMap[creator.profile_id] || 0) : 0;
        const adjustedPoints = basePoints + adjustment;

        return {
          id: creator.id,
          twitter_username: creator.twitter_username,
          arc_points: basePoints,
          adjusted_points: adjustedPoints,
          ring: creator.ring,
          style: creator.style,
          meta: creator.meta || {},
        };
      }),
      sentiment: {
        enabled: true,
        summary: null,
        series: [],
      },
    };

    return res.status(200).json(response);
  } catch (error: any) {
    console.error('[API /portal/arc/arenas/[slug]] Error:', error);

    // Check for specific Supabase errors
    if (error.message?.includes('configuration missing')) {
      return res.status(503).json({
        ok: false,
        error: 'ARC service is not configured',
      });
    }

    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch arena details',
    });
  }
}
