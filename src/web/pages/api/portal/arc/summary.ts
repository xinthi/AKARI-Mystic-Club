/**
 * API Route: GET /api/portal/arc/summary
 * 
 * Returns ARC summary statistics for the dashboard.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { getEffectiveArcActive } from '@/lib/arc/expiration';
import { enforceArcApiTier } from '@/lib/arc/api-tier-guard';

// =============================================================================
// TYPES
// =============================================================================

interface ArcSummary {
  trackedProjects: number; // All projects with profile_type='project' (tracked in Sentiment)
  arcEnabled: number; // Projects with ARC enabled: arc_active=true AND arc_access_level != 'none' (includes leaderboard, gamified, creator_manager)
  activePrograms: number; // All active events (creator_manager_programs + arenas where status='active')
  creatorsParticipating: number; // Unique creators across all events (creator_manager_creators + arena_creators)
}

type ArcSummaryResponse =
  | {
      ok: true;
      summary: ArcSummary;
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
  res: NextApiResponse<ArcSummaryResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }
  
  // Enforce tier guard
  const tierCheck = await enforceArcApiTier(req, res, '/api/portal/arc/summary');
  if (tierCheck) {
    return tierCheck; // Access denied
  }

  try {
    // Create Supabase client
    let supabase;
    try {
      supabase = createPortalClient();
    } catch (configError: any) {
      console.error('[ARC Summary API] Supabase configuration error:', configError);
      // Return zeros if configuration is missing (safe fallback)
      return res.status(200).json({
        ok: true,
        summary: {
          trackedProjects: 0,
          arcEnabled: 0,
          activePrograms: 0,
          creatorsParticipating: 0,
        },
      });
    }

    // Get tracked projects (profile_type = 'project')
    // These are all projects tracked in AKARI Sentiment that are classified as projects
    // Note: We don't filter by is_active because that only controls daily updates, not tracking status
    const { count: trackedProjectsCount, error: projectsError } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('profile_type', 'project');

    if (projectsError) {
      console.error('[ARC Summary API] Error counting tracked projects:', projectsError);
    }

    // Get ARC enabled projects
    // ARC Enabled = arc_active === true AND arc_access_level !== 'none' AND (arc_active_until IS NULL OR arc_active_until >= now)
    // This includes: 'leaderboard', 'gamified', 'creator_manager'
    // Note: We filter by arc_active=true first, then check expiration in code
    const { data: arcEnabledProjects, error: arcEnabledError } = await supabase
      .from('projects')
      .select('arc_active, arc_active_until')
      .eq('arc_active', true)
      .neq('arc_access_level', 'none')
      .eq('profile_type', 'project'); // Only count projects, not personal profiles
    
    // Filter out expired projects (virtual disable)
    const arcEnabledCount = arcEnabledProjects?.filter(p => 
      getEffectiveArcActive(p.arc_active, p.arc_active_until)
    ).length || 0;

    if (arcEnabledError) {
      console.error('[ARC Summary API] Error counting ARC enabled projects:', arcEnabledError);
    }

    // Get active programs: Creator Manager programs + ARC Arenas
    // Both where status='active'
    const [creatorManagerProgramsResult, arenasResult] = await Promise.all([
      supabase
        .from('creator_manager_programs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active'),
      supabase
        .from('arenas')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active'),
    ]);

    const creatorManagerProgramsCount = creatorManagerProgramsResult.count || 0;
    const arenasCount = arenasResult.count || 0;
    const activeProgramsCount = creatorManagerProgramsCount + arenasCount;

    if (creatorManagerProgramsResult.error) {
      console.error('[ARC Summary API] Error counting Creator Manager programs:', creatorManagerProgramsResult.error);
    }
    if (arenasResult.error) {
      console.error('[ARC Summary API] Error counting arenas:', arenasResult.error);
    }

    // Get creators participating across all events
    // Count unique creators from:
    // 1. creator_manager_creators (status in ('pending', 'approved'))
    // 2. arena_creators (all entries)
    const [creatorManagerCreatorsResult, arenaCreatorsResult] = await Promise.all([
      supabase
        .from('creator_manager_creators')
        .select('creator_profile_id')
        .in('status', ['pending', 'approved']),
      supabase
        .from('arena_creators')
        .select('profile_id'),
    ]);

    // Get unique creator IDs from both sources
    const creatorManagerCreatorsData = creatorManagerCreatorsResult.data || [];
    const arenaCreatorsData = arenaCreatorsResult.data || [];

    // Collect all unique creator profile IDs (union of both sources)
    const uniqueCreatorIds = new Set<string>();

    // Add Creator Manager creators
    creatorManagerCreatorsData.forEach((c: any) => {
      if (c.creator_profile_id && typeof c.creator_profile_id === 'string') {
        uniqueCreatorIds.add(c.creator_profile_id);
      }
    });

    // Add Arena creators
    arenaCreatorsData.forEach((c: any) => {
      if (c.profile_id && typeof c.profile_id === 'string') {
        uniqueCreatorIds.add(c.profile_id);
      }
    });

    // Total unique creators participating across all events
    const creatorsParticipatingCount = uniqueCreatorIds.size;

    if (creatorManagerCreatorsResult.error) {
      console.error('[ARC Summary API] Error counting Creator Manager creators:', creatorManagerCreatorsResult.error);
    }
    if (arenaCreatorsResult.error) {
      console.error('[ARC Summary API] Error counting arena creators:', arenaCreatorsResult.error);
    }

    // Return summary with safe fallbacks (0 if errors occurred)
    return res.status(200).json({
      ok: true,
      summary: {
        trackedProjects: trackedProjectsCount || 0,
        arcEnabled: arcEnabledCount || 0,
        activePrograms: activeProgramsCount || 0,
        creatorsParticipating: creatorsParticipatingCount || 0,
      },
    });
  } catch (error: any) {
    console.error('[ARC Summary API] Error:', error);
    // Return zeros on error (safe fallback)
    return res.status(200).json({
      ok: true,
      summary: {
        trackedProjects: 0,
        arcEnabled: 0,
        activePrograms: 0,
        creatorsParticipating: 0,
      },
    });
  }
}

