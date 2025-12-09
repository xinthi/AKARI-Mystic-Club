/**
 * API Route: POST /api/portal/sentiment/watchlist
 * 
 * Add or remove a project from the user's watchlist.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { FEATURE_KEYS } from '@/lib/permissions';

// =============================================================================
// TYPES
// =============================================================================

interface WatchlistActionRequest {
  projectId: string;
  action: 'add' | 'remove';
}

type WatchlistActionResponse =
  | { ok: true }
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

async function getUserIdFromSession(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessionToken: string
): Promise<string | null> {
  const { data: session, error } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (error || !session) {
    return null;
  }

  // Check if session is expired
  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    return null;
  }

  return session.user_id;
}

async function getUserWatchlistLimit(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<number> {
  // Check if user has Deep Explorer or Institutional Plus feature
  const { data: grants } = await supabase
    .from('akari_user_feature_grants')
    .select('feature_key, starts_at, ends_at')
    .eq('user_id', userId)
    .in('feature_key', [FEATURE_KEYS.DeepExplorer, FEATURE_KEYS.InstitutionalPlus]);

  if (!grants || grants.length === 0) {
    return 10; // Default limit
  }

  // Check if any grant is active
  const now = new Date();
  const hasActiveGrant = grants.some((g: any) => {
    const startsAt = g.starts_at ? new Date(g.starts_at) : null;
    const endsAt = g.ends_at ? new Date(g.ends_at) : null;
    if (startsAt && startsAt > now) return false;
    if (endsAt && endsAt < now) return false;
    return true;
  });

  return hasActiveGrant ? 100 : 10;
}

async function getCurrentWatchlistCount(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<number> {
  const { count } = await supabase
    .from('akari_user_watchlist')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  return count || 0;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WatchlistActionResponse>
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Get session token
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get user ID from session
    const userId = await getUserIdFromSession(supabase, sessionToken);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired session' });
    }

    // Parse request body
    const body = req.body as WatchlistActionRequest;
    if (!body.projectId || !body.action || (body.action !== 'add' && body.action !== 'remove')) {
      return res.status(400).json({ ok: false, error: 'Invalid request body' });
    }

    if (body.action === 'add') {
      // Check if already in watchlist
      const { data: existing } = await supabase
        .from('akari_user_watchlist')
        .select('id')
        .eq('user_id', userId)
        .eq('project_id', body.projectId)
        .single();

      if (existing) {
        // Already in watchlist, do nothing
        return res.status(200).json({ ok: true });
      }

      // Check watchlist limit
      const limit = await getUserWatchlistLimit(supabase, userId);
      const currentCount = await getCurrentWatchlistCount(supabase, userId);

      if (currentCount >= limit) {
        return res.status(400).json({
          ok: false,
          error: `Watchlist limit reached (${limit} projects). Upgrade to Deep Explorer or Institutional Plus for up to 100 projects.`,
        });
      }

      // Insert watchlist entry
      const { error: insertError } = await supabase
        .from('akari_user_watchlist')
        .insert({
          user_id: userId,
          project_id: body.projectId,
        });

      if (insertError) {
        console.error('[Watchlist Action API] Error adding to watchlist:', insertError);
        return res.status(500).json({ ok: false, error: 'Failed to add to watchlist' });
      }

      return res.status(200).json({ ok: true });
    } else {
      // Remove from watchlist
      const { error: deleteError } = await supabase
        .from('akari_user_watchlist')
        .delete()
        .eq('user_id', userId)
        .eq('project_id', body.projectId);

      if (deleteError) {
        console.error('[Watchlist Action API] Error removing from watchlist:', deleteError);
        return res.status(500).json({ ok: false, error: 'Failed to remove from watchlist' });
      }

      return res.status(200).json({ ok: true });
    }
  } catch (error: any) {
    console.error('[Watchlist Action API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

