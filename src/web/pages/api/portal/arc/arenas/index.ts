/**
 * API Route: GET /api/portal/arc/arenas
 * 
 * Returns a list of arenas for a given project.
 * Query params:
 * - projectId (UUID): Filter by arenas.project_id
 * - slug (string): Join projects on projects.slug = slug and filter by that
 * 
 * At least one of projectId or slug must be provided.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';

// =============================================================================
// TYPES
// =============================================================================

interface Arena {
  id: string;
  project_id: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';
  starts_at: string | null;
  ends_at: string | null;
  reward_depth: number;
}

type ArenasResponse =
  | {
      ok: true;
      arenas: Arena[];
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
  res: NextApiResponse<ArenasResponse>
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

    // Extract query parameters
    const projectId = req.query.projectId as string | undefined;
    const slug = req.query.slug as string | undefined;

    // Validate that at least one filter is provided
    if (!projectId && !slug) {
      return res.status(400).json({
        ok: false,
        error: 'Either projectId or slug query parameter is required',
      });
    }

    let targetProjectId: string | null = null;

    // If slug is provided, first resolve it to project_id
    if (slug) {
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', slug)
        .single();

      if (projectError) {
        // Check if it's a "not found" error
        if (projectError.code === 'PGRST116') {
          return res.status(404).json({
            ok: false,
            error: 'Project not found',
          });
        }

        console.error('[API /portal/arc/arenas] Supabase error fetching project by slug:', projectError);
        return res.status(500).json({
          ok: false,
          error: 'Internal server error',
        });
      }

      if (!projectData) {
        return res.status(404).json({
          ok: false,
          error: 'Project not found',
        });
      }

      targetProjectId = projectData.id;
    } else {
      // Use provided projectId directly
      targetProjectId = projectId!;
    }

    // Check ARC access (Option 2 = Leaderboard)
    const supabaseAdmin = getSupabaseAdmin();
    const accessCheck = await requireArcAccess(supabaseAdmin, targetProjectId, 2);
    if (!accessCheck.ok) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error,
      });
    }

    // Query arenas filtered by project_id
    const { data, error } = await supabase
      .from('arenas')
      .select(`
        id,
        project_id,
        slug,
        name,
        description,
        status,
        starts_at,
        ends_at,
        reward_depth
      `)
      .eq('project_id', targetProjectId);

    if (error) {
      console.error('[API /portal/arc/arenas] Supabase error:', error);
      return res.status(500).json({
        ok: false,
        error: 'Internal server error',
      });
    }

    // Map data to response format
    const arenas: Arena[] = (data || []).map((row: any) => ({
      id: row.id,
      project_id: row.project_id,
      slug: row.slug,
      name: row.name,
      description: row.description ?? null,
      status: row.status,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      reward_depth: row.reward_depth,
    }));

    return res.status(200).json({
      ok: true,
      arenas,
    });
  } catch (error: any) {
    console.error('[API /portal/arc/arenas] Error:', error);
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
}
