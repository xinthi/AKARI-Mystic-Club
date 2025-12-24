/**
 * API Route: GET /api/portal/arc/quests/completions
 * 
 * Returns completed mission/quest IDs for the current user for a specific arena.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';

// =============================================================================
// TYPES
// =============================================================================

interface Completion {
  mission_id: string;
  completed_at: string;
}

type CompletionsResponse =
  | { ok: true; completions: Completion[] }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSessionTokenFromRequest(req: NextApiRequest): string | null {
  // Try req.cookies first (Next.js parsed)
  if (req.cookies && typeof req.cookies === 'object' && 'akari_session' in req.cookies) {
    const token = req.cookies['akari_session'];
    if (token && typeof token === 'string' && token.length > 0) {
      return token;
    }
  }

  // Fall back to parsing cookie header
  const cookieHeader = req.headers.cookie ?? '';
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map((c: string) => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }

  return null;
}

async function getCurrentUserProfile(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessionToken: string
): Promise<{ profileId: string } | null> {
  const { data: session, error: sessionError } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (sessionError || !session) {
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    return null;
  }

  // Get user's Twitter username to find profile
  const { data: xIdentity, error: identityError } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', session.user_id)
    .eq('provider', 'x')
    .single();

  if (identityError || !xIdentity?.username) {
    return null;
  }

  const cleanUsername = xIdentity.username.toLowerCase().replace('@', '');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', cleanUsername)
    .single();

  if (profileError || !profile) {
    return null;
  }

  return { profileId: profile.id };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CompletionsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get arenaId from query
    const { arenaId } = req.query;
    if (!arenaId || typeof arenaId !== 'string') {
      return res.status(400).json({ ok: false, error: 'arenaId is required' });
    }

    // Resolve arena.project_id for access check
    const { data: arena, error: arenaError } = await supabase
      .from('arenas')
      .select('id, project_id')
      .eq('id', arenaId)
      .single();

    if (arenaError || !arena) {
      return res.status(404).json({ ok: false, error: 'Arena not found' });
    }

    if (!arena.project_id) {
      return res.status(400).json({ ok: false, error: 'Arena missing project_id' });
    }

    // Check ARC access (Option 3 = Gamified) - quest completions are Option 3 feature
    const accessCheck = await requireArcAccess(supabase, arena.project_id, 3);
    if (!accessCheck.ok) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error,
      });
    }

    // Get current user profile
    const sessionToken = getSessionTokenFromRequest(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Authentication required' });
    }

    const userProfile = await getCurrentUserProfile(supabase, sessionToken);
    if (!userProfile) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    // Fetch completed missions for this user and arena
    const { data: completions, error: completionsError } = await supabase
      .from('arc_quest_completions')
      .select('mission_id, completed_at')
      .eq('profile_id', userProfile.profileId)
      .eq('arena_id', arenaId)
      .order('completed_at', { ascending: false });

    if (completionsError) {
      console.error('[ARC Quest Completions] Error fetching completions:', completionsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch completions' });
    }

    return res.status(200).json({
      ok: true,
      completions: (completions || []).map((c) => ({
        mission_id: c.mission_id,
        completed_at: c.completed_at,
      })),
    });
  } catch (error: any) {
    console.error('[ARC Quest Completions] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

