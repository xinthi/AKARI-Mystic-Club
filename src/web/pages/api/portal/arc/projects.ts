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
  name: string | null;
  twitter_username: string | null;
  arc_tier: 'basic' | 'pro' | 'event_host';
  arc_status: 'inactive' | 'active' | 'suspended';
  security_status: 'normal' | 'alert' | 'clear';
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
        projects (
          id,
          name,
          twitter_username
        )
      `)
      .eq('is_arc_enabled', true);

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
    const projects: ArcProject[] = data.map((row: any) => ({
      project_id: row.project_id,
      name: row.projects?.name ?? null,
      twitter_username: row.projects?.twitter_username ?? null,
      arc_tier: row.tier,
      arc_status: row.status,
      security_status: row.security_status,
    }));

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
