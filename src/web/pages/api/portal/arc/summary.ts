/**
 * API Route: GET /api/portal/arc/summary
 * 
 * Returns ARC summary statistics for the dashboard.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface ArcSummary {
  approvedProjects: number;
  arcEnabled: number;
  activePrograms: number;
  creatorsParticipating: number;
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
          approvedProjects: 0,
          arcEnabled: 0,
          activePrograms: 0,
          creatorsParticipating: 0,
        },
      });
    }

    // Get approved projects (profile_type = 'project')
    const { count: approvedProjectsCount, error: projectsError } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('profile_type', 'project')
      .eq('is_active', true);

    if (projectsError) {
      console.error('[ARC Summary API] Error counting approved projects:', projectsError);
    }

    // Get ARC enabled projects (arc_active = true)
    const { count: arcEnabledCount, error: arcEnabledError } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('arc_active', true)
      .eq('is_active', true);

    if (arcEnabledError) {
      console.error('[ARC Summary API] Error counting ARC enabled projects:', arcEnabledError);
    }

    // Get active Creator Manager programs
    const { count: activeProgramsCount, error: programsError } = await supabase
      .from('creator_manager_programs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    if (programsError) {
      console.error('[ARC Summary API] Error counting active programs:', programsError);
    }

    // Get creators participating (status in ('pending', 'approved'))
    const { count: creatorsCount, error: creatorsError } = await supabase
      .from('creator_manager_creators')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'approved']);

    if (creatorsError) {
      console.error('[ARC Summary API] Error counting creators:', creatorsError);
    }

    // Return summary with safe fallbacks (0 if errors occurred)
    return res.status(200).json({
      ok: true,
      summary: {
        approvedProjects: approvedProjectsCount || 0,
        arcEnabled: arcEnabledCount || 0,
        activePrograms: activeProgramsCount || 0,
        creatorsParticipating: creatorsCount || 0,
      },
    });
  } catch (error: any) {
    console.error('[ARC Summary API] Error:', error);
    // Return zeros on error (safe fallback)
    return res.status(200).json({
      ok: true,
      summary: {
        approvedProjects: 0,
        arcEnabled: 0,
        activePrograms: 0,
        creatorsParticipating: 0,
      },
    });
  }
}

