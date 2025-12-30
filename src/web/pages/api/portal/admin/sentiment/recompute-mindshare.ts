/**
 * Admin Endpoint: Recompute Mindshare Snapshots
 * 
 * POST /api/portal/admin/sentiment/recompute-mindshare
 * 
 * Manually triggers mindshare snapshot computation for all windows.
 * Requires superadmin authentication.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { getSessionToken } from '../../../../../lib/server-auth';
import { computeAllMindshareSnapshots } from '../../../../../../server/mindshare/snapshot';

const DEV_MODE = process.env.NODE_ENV === 'development';

// =============================================================================
// TYPES
// =============================================================================

type RecomputeResponse =
  | {
      ok: true;
      results: Array<{
        window: string;
        asOfDate: string;
        totalProjects: number;
        snapshotsCreated: number;
        snapshotsUpdated: number;
        errors: string[];
      }>;
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================================
// AUTHENTICATION
// =============================================================================

async function checkSuperAdmin(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<boolean> {
  const { data: roles } = await supabase
    .from('akari_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');

  return (roles?.length ?? 0) > 0;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RecomputeResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // ==========================================================================
    // AUTHENTICATION: Check Super Admin (with DEV MODE bypass)
    // ==========================================================================
    if (!DEV_MODE) {
      const sessionToken = getSessionToken(req);
      if (!sessionToken) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      // Validate session and get user ID
      const { data: session, error: sessionError } = await supabase
        .from('akari_user_sessions')
        .select('user_id, expires_at')
        .eq('session_token', sessionToken)
        .single();

      if (sessionError || !session) {
        return res.status(401).json({ ok: false, error: 'Invalid session' });
      }

      // Check if session is expired
      if (new Date(session.expires_at) < new Date()) {
        await supabase
          .from('akari_user_sessions')
          .delete()
          .eq('session_token', sessionToken);
        return res.status(401).json({ ok: false, error: 'Session expired' });
      }

      const userId = session.user_id;

      // Check if user is super admin
      const isSuperAdmin = await checkSuperAdmin(supabase, userId);
      if (!isSuperAdmin) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
    } else {
      console.log('[RecomputeMindshare] DEV MODE - skipping auth');
    }

    // ==========================================================================
    // PARSE REQUEST BODY
    // ==========================================================================
    const body = req.body || {};
    const asOfDateStr = body.asOfDate as string | undefined;
    const asOfDate = asOfDateStr ? new Date(asOfDateStr) : new Date();

    // ==========================================================================
    // COMPUTE SNAPSHOTS
    // ==========================================================================
    console.log(`[RecomputeMindshare] Starting computation for asOfDate=${asOfDate.toISOString().split('T')[0]}`);
    
    const results = await computeAllMindshareSnapshots(supabase, asOfDate);

    console.log(`[RecomputeMindshare] Completed: ${results.length} windows processed`);

    return res.status(200).json({
      ok: true,
      results: results.map(r => ({
        window: r.window,
        asOfDate: r.asOfDate,
        totalProjects: r.totalProjects,
        snapshotsCreated: r.snapshotsCreated,
        snapshotsUpdated: r.snapshotsUpdated,
        errors: r.errors,
      })),
    });
  } catch (error) {
    console.error('[RecomputeMindshare] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
