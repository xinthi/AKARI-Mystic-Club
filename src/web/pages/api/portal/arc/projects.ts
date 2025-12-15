/**
 * API Route: GET /api/portal/arc/projects
 * 
 * Returns a list of all projects with ARC settings enabled.
 * Joins project_arc_settings with projects table.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface ArcProject {
  project_id: string;
  slug: string | null;
  name: string | null;
  twitter_username: string | null;
  arc_tier: 'basic' | 'pro' | 'event_host';
  arc_status: 'inactive' | 'active' | 'suspended';
  security_status: 'normal' | 'alert' | 'clear';
  meta?: {
    banner_url?: string | null;
    accent_color?: string | null;
    tagline?: string | null;
  };
  stats?: {
    creatorCount?: number;
    totalPoints?: number;
    trend?: 'rising' | 'stable' | 'cooling';
  };
}

type ArcProjectsResponse =
  | {
      ok: true;
      projects: ArcProject[];
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
  res: NextApiResponse<ArcProjectsResponse>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  try {
    // Create Supabase client (read-only with anon key)
    const supabase = createPortalClient();

    // Query project_arc_settings joined with projects
    const { data, error } = await supabase
      .from('project_arc_settings')
      .select(`
        project_id,
        tier,
        status,
        security_status,
        meta,
        projects (
          id,
          slug,
          name,
          twitter_username
        )
      `)
      .eq('is_arc_enabled', true);

    // Get stats for each project (creator count, total points)
    const projectIds = data?.map((row: any) => row.project_id) || [];
    const statsMap = new Map<string, { creatorCount: number; totalPoints: number }>();

    if (projectIds.length > 0) {
      // Get active arenas for these projects
      const { data: arenas } = await supabase
        .from('arenas')
        .select('id, project_id')
        .in('project_id', projectIds)
        .eq('status', 'active');

      if (arenas && arenas.length > 0) {
        const arenaIds = arenas.map(a => a.id);
        
        // Get creator counts and total points per project
        const { data: creators } = await supabase
          .from('arena_creators')
          .select('arena_id, arc_points')
          .in('arena_id', arenaIds);

        if (creators) {
          const projectArenaMap = new Map(arenas.map(a => [a.id, a.project_id]));
          
          creators.forEach(creator => {
            const projectId = projectArenaMap.get(creator.arena_id);
            if (projectId) {
              const existing = statsMap.get(projectId) || { creatorCount: 0, totalPoints: 0 };
              statsMap.set(projectId, {
                creatorCount: existing.creatorCount + 1,
                totalPoints: existing.totalPoints + Number(creator.arc_points || 0),
              });
            }
          });
        }
      }
    }

    if (error) {
      console.error('[API /portal/arc/projects] Supabase error:', error);
      return res.status(500).json({
        ok: false,
        error: 'Internal server error',
      });
    }

    if (data === null) {
      return res.status(200).json({
        ok: true,
        projects: [],
      });
    }

    // Map data to response format
    const projects: ArcProject[] = data.map((row: any) => {
      const stats = statsMap.get(row.project_id) || { creatorCount: 0, totalPoints: 0 };
      const trend: 'rising' | 'stable' | 'cooling' = stats.creatorCount > 10 ? 'rising' : stats.creatorCount > 5 ? 'stable' : 'cooling';
      
      return {
        project_id: row.project_id,
        slug: row.projects?.slug ?? null,
        name: row.projects?.name ?? null,
        twitter_username: row.projects?.twitter_username ?? null,
        arc_tier: row.tier,
        arc_status: row.status,
        security_status: row.security_status,
        meta: (row.meta as any) || {},
        stats: {
          creatorCount: stats.creatorCount,
          totalPoints: stats.totalPoints,
          trend,
        },
      };
    });

    return res.status(200).json({
      ok: true,
      projects,
    });
  } catch (error: any) {
    console.error('[API /portal/arc/projects] Error:', error);
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
}
