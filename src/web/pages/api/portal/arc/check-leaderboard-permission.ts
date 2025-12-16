/**
 * API Route: GET /api/portal/arc/check-leaderboard-permission?projectId=...
 * 
 * Checks if the current user can request a leaderboard for a project.
 * Returns { ok: true, canRequest: boolean }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { canRequestLeaderboard } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

type PermissionCheckResponse =
  | { ok: true; canRequest: boolean }
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

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PermissionCheckResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(200).json({ ok: true, canRequest: false });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get session
    const { data: session, error: sessionError } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      return res.status(200).json({ ok: true, canRequest: false });
    }

    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from('akari_user_sessions')
        .delete()
        .eq('session_token', sessionToken);
      return res.status(200).json({ ok: true, canRequest: false });
    }

    const { projectId } = req.query;
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    // Check permission
    const canRequest = await canRequestLeaderboard(supabase, session.user_id, projectId);

    return res.status(200).json({ ok: true, canRequest });
  } catch (error: any) {
    console.error('[Check Leaderboard Permission API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

