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

interface ArcProjectFeatures {
  leaderboard_enabled: boolean;
  leaderboard_start_at: string | null;
  leaderboard_end_at: string | null;
  gamefi_enabled: boolean;
  gamefi_start_at: string | null;
  gamefi_end_at: string | null;
  crm_enabled: boolean;
  crm_start_at: string | null;
  crm_end_at: string | null;
  crm_visibility: 'private' | 'public' | 'hybrid' | null;
}

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
  features?: ArcProjectFeatures | null;
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
  
  // This endpoint is PUBLIC - no authentication required
  // It returns a list of ARC-enabled projects for the home page

  try {
    // Create Supabase client (read-only with anon key)
    let supabase;
    try {
      supabase = createPortalClient();
    } catch (configError: any) {
      console.error('[ARC Projects API] Supabase configuration error:', configError);
      return res.status(503).json({
        ok: false,
        error: 'Server configuration error. Please contact support.',
      });
    }

    // Query projects with ARC access approved OR arc_active=true
    // First, get approved projects from arc_project_access
    const { data: approvedAccess, error: accessError } = await supabase
      .from('arc_project_access')
      .select('project_id')
      .eq('application_status', 'approved');
    
    const approvedProjectIds = approvedAccess?.map(a => a.project_id) || [];
    
    // Also get projects with arc_active=true (backward compatibility)
    const { data: activeProjects, error: activeError } = await supabase
      .from('projects')
      .select('id')
      .eq('arc_active', true);
    
    const activeProjectIds = activeProjects?.map(p => p.id) || [];
    
    // Combine both sets
    const allProjectIds = [...new Set([...approvedProjectIds, ...activeProjectIds])];
    
    if (allProjectIds.length === 0) {
      return res.status(200).json({
        ok: true,
        projects: [],
      });
    }
    
    // Get project details with optional project_arc_settings metadata and arc_project_features
    const { data: projectsData, error: projectsError } = await supabase
      .from('projects')
      .select(`
        id,
        slug,
        name,
        twitter_username,
        header_image_url,
        project_arc_settings (
          tier,
          status,
          security_status,
          meta
        ),
        arc_project_features (
          leaderboard_enabled,
          leaderboard_start_at,
          leaderboard_end_at,
          gamefi_enabled,
          gamefi_start_at,
          gamefi_end_at,
          crm_enabled,
          crm_start_at,
          crm_end_at,
          crm_visibility
        )
      `)
      .in('id', allProjectIds);
    
    if (projectsError) {
      console.error('[API /portal/arc/projects] Error fetching projects:', projectsError);
      return res.status(500).json({
        ok: false,
        error: 'Internal server error',
      });
    }
    
    // Map to response format
    const data = projectsData?.map((p: any) => {
      const settingsMeta = p.project_arc_settings?.[0]?.meta || {};
      // Merge header_image_url from projects table into meta, taking precedence
      const mergedMeta = {
        ...settingsMeta,
        banner_url: p.header_image_url || settingsMeta.banner_url || null,
      };
      return {
        project_id: p.id,
        projects: {
          id: p.id,
          slug: p.slug,
          name: p.name,
          twitter_username: p.twitter_username,
        },
        tier: p.project_arc_settings?.[0]?.tier || 'basic',
        status: p.project_arc_settings?.[0]?.status || 'active',
        security_status: p.project_arc_settings?.[0]?.security_status || 'normal',
        meta: mergedMeta,
      };
    }) || [];

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

    // Map data to response format
    const projects: ArcProject[] = data.map((row: any) => {
      const stats = statsMap.get(row.project_id) || { creatorCount: 0, totalPoints: 0 };
      const trend: 'rising' | 'stable' | 'cooling' = stats.creatorCount > 10 ? 'rising' : stats.creatorCount > 5 ? 'stable' : 'cooling';
      
      // Extract features from arc_project_features (it's an array, take first or null)
      const featuresData = row.arc_project_features?.[0] || null;
      const features: ArcProjectFeatures | null = featuresData ? {
        leaderboard_enabled: featuresData.leaderboard_enabled || false,
        leaderboard_start_at: featuresData.leaderboard_start_at || null,
        leaderboard_end_at: featuresData.leaderboard_end_at || null,
        gamefi_enabled: featuresData.gamefi_enabled || false,
        gamefi_start_at: featuresData.gamefi_start_at || null,
        gamefi_end_at: featuresData.gamefi_end_at || null,
        crm_enabled: featuresData.crm_enabled || false,
        crm_start_at: featuresData.crm_start_at || null,
        crm_end_at: featuresData.crm_end_at || null,
        crm_visibility: (featuresData.crm_visibility as 'private' | 'public' | 'hybrid') || null,
      } : null;
      
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
        features,
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
