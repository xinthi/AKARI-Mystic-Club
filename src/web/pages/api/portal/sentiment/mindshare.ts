/**
 * Read API: Mindshare Data
 * 
 * GET /api/portal/sentiment/mindshare?window=24h|48h|7d|30d
 * 
 * Returns mindshare data for all projects with deltas.
 * Requires portal user authentication.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '../../../../lib/portal/supabase';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';

// =============================================================================
// TYPES
// =============================================================================

type TimeWindow = '24h' | '48h' | '7d' | '30d';

type MindshareResponse =
  | {
      ok: true;
      window: TimeWindow;
      as_of_date: string;
      entries: Array<{
        project_id: string;
        project_name: string;
        x_handle: string;
        mindshare_bps: number;
        delta_1d: number | null;
        delta_7d: number | null;
        updated_as_of_date: string;
      }>;
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================================
// HANDLER
// =============================================================================

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MindshareResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Parse window parameter
    const window = (req.query.window as string) || '7d';
    if (!['24h', '48h', '7d', '30d'].includes(window)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid window. Must be one of: 24h, 48h, 7d, 30d',
      });
    }

    // Basic auth check (portal user)
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const supabase = createPortalClient();
    const supabaseAdmin = getSupabaseAdmin();

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Fetch snapshots for the window
    const { data: snapshots, error: snapshotsError } = await supabase
      .from('project_mindshare_snapshots')
      .select('project_id, mindshare_bps, as_of_date')
      .eq('time_window', window)
      .eq('as_of_date', today)
      .order('mindshare_bps', { ascending: false });

    if (snapshotsError) {
      console.error('[MindshareAPI] Error fetching snapshots:', snapshotsError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch mindshare data',
      });
    }

    if (!snapshots || snapshots.length === 0) {
      return res.status(200).json({
        ok: true,
        window: window as TimeWindow,
        as_of_date: today,
        entries: [],
      });
    }

    // Get project IDs
    const projectIds = snapshots.map(s => s.project_id);

    // Fetch project names and handles
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, name, x_handle')
      .in('id', projectIds);

    if (projectsError) {
      console.error('[MindshareAPI] Error fetching projects:', projectsError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch project data',
      });
    }

    const projectMap = new Map(
      (projects || []).map(p => [p.id, { name: p.name, x_handle: p.x_handle || '' }])
    );

    // Calculate deltas using the database function
    const entries = await Promise.all(
      snapshots.map(async snapshot => {
        const project = projectMap.get(snapshot.project_id);
        if (!project) {
          return null;
        }

        // Get delta_1d using get_mindshare_delta function
        const { data: delta1dData, error: delta1dError } = await supabaseAdmin.rpc('get_mindshare_delta', {
          p_project_id: snapshot.project_id,
          p_time_window: window,
          p_days_ago: 1,
        });

        // Get delta_7d
        const { data: delta7dData, error: delta7dError } = await supabaseAdmin.rpc('get_mindshare_delta', {
          p_project_id: snapshot.project_id,
          p_time_window: window,
          p_days_ago: 7,
        });

        return {
          project_id: snapshot.project_id,
          project_name: project.name,
          x_handle: project.x_handle,
          mindshare_bps: snapshot.mindshare_bps,
          delta_1d: delta1dData as number | null,
          delta_7d: delta7dData as number | null,
          updated_as_of_date: snapshot.as_of_date,
        };
      })
    );

    // Filter out null entries
    const validEntries = entries.filter((e): e is NonNullable<typeof e> => e !== null);

    return res.status(200).json({
      ok: true,
      window: window as TimeWindow,
      as_of_date: today,
      entries: validEntries,
    });
  } catch (error) {
    console.error('[MindshareAPI] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
