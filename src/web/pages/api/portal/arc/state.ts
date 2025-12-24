/**
 * API Route: GET /api/portal/arc/state?projectId=<uuid>
 * 
 * Unified ARC state endpoint that returns module enablement state.
 * Reads from arc_project_features first, falls back to legacy fields if row missing.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getArcUnifiedState } from '@/lib/arc/unified-state';
import { enforceArcApiTier } from '@/lib/arc/api-tier-guard';
import { hasAnyArcAccess } from '@/lib/arc-access';
import { requirePortalUser } from '@/lib/server/require-portal-user';

// =============================================================================
// TYPES
// =============================================================================

type ArcStateResponse =
  | {
      ok: true;
      modules: {
        leaderboard: { enabled: boolean; active: boolean; startAt: string | null; endAt: string | null };
        gamefi: { enabled: boolean; active: boolean; startAt: string | null; endAt: string | null };
        crm: { enabled: boolean; active: boolean; startAt: string | null; endAt: string | null; visibility: 'private' | 'public' | 'hybrid' };
      };
      requests: { pending: boolean; lastStatus: 'pending' | 'approved' | 'rejected' | null };
      reason?: string;
    }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ArcStateResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  
  // Authentication (required for ARC state endpoint)
  const portalUser = await requirePortalUser(req, res);
  if (!portalUser) {
    return; // requirePortalUser already sent 401 response
  }

  // Enforce tier guard
  const tierCheck = await enforceArcApiTier(req, res, '/api/portal/arc/state');
  if (tierCheck) {
    return tierCheck; // Access denied
  }

  const { projectId } = req.query;
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ ok: false, error: 'projectId is required' });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(projectId)) {
    return res.status(400).json({ ok: false, error: 'Invalid projectId format' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Check ARC access (any option approved)
    const hasAccess = await hasAnyArcAccess(supabase, projectId);
    if (!hasAccess) {
      return res.status(403).json({ ok: false, error: 'ARC access not approved for this project' });
    }

    // Get profile ID from authenticated user (for request status)
    const profileId: string | null = portalUser.profileId || null;

    // Get unified state
    const state = await getArcUnifiedState(supabase, projectId, profileId);

    return res.status(200).json({
      ok: true,
      modules: {
        leaderboard: {
          enabled: state.modules.leaderboard.enabled,
          active: state.modules.leaderboard.active,
          startAt: state.modules.leaderboard.startAt,
          endAt: state.modules.leaderboard.endAt,
        },
        gamefi: {
          enabled: state.modules.gamefi.enabled,
          active: state.modules.gamefi.active,
          startAt: state.modules.gamefi.startAt,
          endAt: state.modules.gamefi.endAt,
        },
        crm: {
          enabled: state.modules.crm.enabled,
          active: state.modules.crm.active,
          startAt: state.modules.crm.startAt,
          endAt: state.modules.crm.endAt,
          visibility: state.modules.crm.visibility,
        },
      },
      requests: {
        pending: state.requests.pending,
        lastStatus: state.requests.lastStatus,
      },
      reason: state.reason,
    });
  } catch (error: any) {
    console.error('[ARC State API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

