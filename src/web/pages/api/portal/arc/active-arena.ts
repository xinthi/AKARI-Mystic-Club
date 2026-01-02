/**
 * API Route: GET /api/portal/arc/active-arena?projectId=<uuid>
 * 
 * Returns the active arena for a project (if any).
 * Active = status='active' and current time between starts_at and ends_at (inclusive).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';

// =============================================================================
// TYPES
// =============================================================================

type ActiveArenaResponse =
  | {
      ok: true;
      arena: {
        id: string;
        slug: string;
        starts_at: string | null;
        ends_at: string | null;
        status: string;
      } | null;
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
  res: NextApiResponse<ActiveArenaResponse>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  const { projectId } = req.query;

  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'projectId is required',
    });
  }

  try {
    const supabase = createPortalClient();
    const supabaseAdmin = getSupabaseAdmin();
    const now = new Date().toISOString();

    // Verify project is ARC-eligible (is_arc_company = true)
    const { data: projectCheck } = await supabase
      .from('projects')
      .select('id, is_arc_company')
      .eq('id', projectId)
      .single();

    if (!projectCheck || !projectCheck.is_arc_company) {
      return res.status(403).json({
        ok: false,
        error: 'Project is not eligible for ARC',
      });
    }

    // Find active arena: status='active' and now() between starts_at and ends_at
    // Only for ARC-eligible projects (is_arc_company = true)
    const { data: arenaData, error: arenaError } = await supabase
      .from('arenas')
      .select('id, slug, starts_at, ends_at, status')
      .eq('project_id', projectId)
      .eq('status', 'active')
      .lte('starts_at', now)
      .gte('ends_at', now)
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (arenaError) {
      console.error('[API /portal/arc/active-arena] Error:', arenaError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch arena',
      });
    }

    if (!arenaData) {
      return res.status(200).json({
        ok: true,
        arena: null,
      });
    }

    return res.status(200).json({
      ok: true,
      arena: {
        id: arenaData.id,
        slug: arenaData.slug,
        starts_at: arenaData.starts_at,
        ends_at: arenaData.ends_at,
        status: arenaData.status,
      },
    });
  } catch (error: any) {
    console.error('[API /portal/arc/active-arena] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}

