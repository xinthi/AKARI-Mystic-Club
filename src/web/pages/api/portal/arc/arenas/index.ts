/**
 * API Route: GET /api/portal/arc/arenas
 * 
 * Returns a list of arenas with optional filtering by project_id and/or status.
 * Orders by starts_at DESC NULLS LAST.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface Arena {
  id: string;
  project_id: string;
  slug: string;
  name: string;
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

    // Extract optional query parameters
    const projectId = req.query.projectId as string | undefined;
    const status = req.query.status as string | undefined;

    // Validate status if provided
    const validStatuses = ['draft', 'scheduled', 'active', 'ended', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    // Build query
    let query = supabase
      .from('arenas')
      .select('id, project_id, slug, name, status, starts_at, ends_at, reward_depth');

    // Apply filters
    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    // Order by starts_at DESC NULLS LAST
    query = query.order('starts_at', { ascending: false, nullsFirst: false });

    // Execute query
    const { data, error } = await query;

    if (error) {
      console.error('[API /portal/arc/arenas] Supabase error:', error);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch arenas',
      });
    }

    return res.status(200).json({
      ok: true,
      arenas: (data || []) as Arena[],
    });
  } catch (error: any) {
    console.error('[API /portal/arc/arenas] Error:', error);

    // Check for specific Supabase errors
    if (error.message?.includes('configuration missing')) {
      return res.status(503).json({
        ok: false,
        error: 'ARC service is not configured',
      });
    }

    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch arenas',
    });
  }
}
