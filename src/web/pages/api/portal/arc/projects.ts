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
  name: string;
  twitter_username: string;
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

    // Select from project_arc_settings joined with projects
    // Only return rows where is_arc_enabled = true
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
          x_handle
        )
      `)
      .eq('is_arc_enabled', true);

    if (error) {
      console.error('[API /portal/arc/projects] Supabase error:', error);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch ARC projects',
      });
    }

    // Transform the data to match the response shape
    // Map x_handle to twitter_username for API response
    const projects: ArcProject[] = (data || [])
      .filter((row: any) => row.projects !== null) // Filter out rows where project doesn't exist
      .map((row: any) => {
        const project = row.projects;
        return {
          project_id: row.project_id,
          name: project?.name || '',
          twitter_username: project?.x_handle || '',
          arc_tier: row.tier,
          arc_status: row.status,
          security_status: row.security_status,
        };
      });

    return res.status(200).json({
      ok: true,
      projects,
    });
  } catch (error: any) {
    console.error('[API /portal/arc/projects] Error:', error);

    // Check for specific Supabase errors
    if (error.message?.includes('configuration missing')) {
      return res.status(503).json({
        ok: false,
        error: 'ARC service is not configured',
      });
    }

    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch ARC projects',
    });
  }
}
