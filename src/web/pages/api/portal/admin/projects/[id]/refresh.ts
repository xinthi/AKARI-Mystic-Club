/**
 * API Route: POST /api/portal/admin/projects/[id]/refresh
 * 
 * Manually triggers a sentiment/metrics refresh for a single project.
 * This endpoint reuses the same sentiment pipeline that the cron jobs use.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { refreshProjectById } from '@/lib/server/sentiment/projectRefresh';

// =============================================================================
// TYPES
// =============================================================================

type RefreshProjectResponse =
  | {
      ok: true;
      projectId: string;
      refreshedAt: string;
      details?: {
        sentimentUpdated: boolean;
        innerCircleUpdated: boolean;
        topicStatsUpdated: boolean;
      };
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

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

async function checkSuperAdmin(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<boolean> {
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
  res: NextApiResponse<RefreshProjectResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const supabase = getSupabaseAdmin();

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

    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Project ID is required' });
    }

    // Get user info for logging
    const { data: user } = await supabase
      .from('akari_users')
      .select('email, username')
      .eq('id', userId)
      .single();

    const userIdentifier = user?.email || user?.username || userId;
    console.log(`[Admin Projects Refresh] Manual refresh triggered by ${userIdentifier} for project ${id}`);

    // Call the shared refresh helper
    const result = await refreshProjectById(id);

    if (!result.ok) {
      // Map error codes to HTTP status codes
      const statusCode = 
        result.code === 'PROJECT_NOT_FOUND' ? 404 :
        result.code === 'NO_TWITTER_USERNAME' ? 400 :
        500;

      return res.status(statusCode).json({
        ok: false,
        error: result.error,
      });
    }

    // Success response
    console.log(`[Admin Projects Refresh] Successfully refreshed project ${id} - Sentiment: ${result.details.sentimentUpdated}, Inner Circle: ${result.details.innerCircleUpdated}, Topic Stats: ${result.details.topicStatsUpdated}`);

    return res.status(200).json({
      ok: true,
      projectId: result.projectId,
      refreshedAt: result.refreshedAt,
      details: {
        sentimentUpdated: result.details.sentimentUpdated,
        innerCircleUpdated: result.details.innerCircleUpdated,
        topicStatsUpdated: result.details.topicStatsUpdated,
      },
    });
  } catch (error: any) {
    console.error('[Admin Projects Refresh] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

