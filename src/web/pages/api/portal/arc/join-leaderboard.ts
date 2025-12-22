/**
 * API Route: POST /api/portal/arc/join-leaderboard
 * 
 * Joins the user to the active arena for a project (Option 2: Normal Leaderboard).
 * Requires verified follow status.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';

// =============================================================================
// TYPES
// =============================================================================

interface JoinLeaderboardBody {
  projectId?: string;
  arenaId?: string;
}

type JoinLeaderboardResponse =
  | { ok: true; arenaId: string; creatorId: string; message?: string }
  | { ok: false; error: string; reason?: 'not_verified' | 'not_authenticated' | 'no_active_arena' };

// =============================================================================
// DEV MODE BYPASS
// =============================================================================

const DEV_MODE = process.env.NODE_ENV === 'development';

// =============================================================================
// HELPERS
// =============================================================================

function getSessionToken(req: NextApiRequest): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  // Handle both single cookie string and multiple cookies separated by semicolons
  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      const token = cookie.substring('akari_session='.length).trim();
      // Handle case where cookie value might be empty or have extra characters
      if (token && token.length > 0) {
        return token;
      }
    }
  }
  return null;
}

async function getCurrentUserProfile(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessionToken: string
): Promise<{ profileId: string; twitterUsername: string } | null> {
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

  // Get user's Twitter username
  const { data: xIdentity, error: identityError } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', session.user_id)
    .eq('provider', 'x')
    .single();

  if (identityError || !xIdentity?.username) {
    return null;
  }

  const cleanUsername = xIdentity.username.toLowerCase().replace('@', '').trim();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', cleanUsername)
    .single();

  if (profileError || !profile) {
    return null;
  }

  return { profileId: profile.id, twitterUsername: cleanUsername };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<JoinLeaderboardResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Authentication
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      // Log for debugging (only in dev)
      if (process.env.NODE_ENV === 'development') {
        console.log('[join-leaderboard] No session token found. Cookie header:', req.headers.cookie ? 'present' : 'missing');
      }
      return res.status(401).json({
        ok: false,
        error: 'Not authenticated',
        reason: 'not_authenticated',
      });
    }

    const userProfile = await getCurrentUserProfile(supabase, sessionToken);
    if (!userProfile) {
      // Log for debugging (only in dev)
      if (process.env.NODE_ENV === 'development') {
        console.log('[join-leaderboard] Failed to get user profile from session token');
      }
      return res.status(401).json({
        ok: false,
        error: 'Invalid session',
        reason: 'not_authenticated',
      });
    }

    // Parse body
    const body = req.body as JoinLeaderboardBody;
    let projectId: string | null = null;
    let arenaId: string | null = body.arenaId || null;

    let fetchedProjectId: string | null = null;
    if (body.projectId) {
      fetchedProjectId = body.projectId;
    } else if (arenaId) {
      // Get projectId from arena
      const { data: arena } = await supabase
        .from('arenas')
        .select('project_id')
        .eq('id', arenaId)
        .single();
      
      if (arena) {
        fetchedProjectId = arena.project_id;
      }
    }

    if (!fetchedProjectId) {
      return res.status(400).json({ ok: false, error: 'projectId or arenaId is required' });
    }

    // Runtime guard: ensure projectId is a non-empty string
    if (!fetchedProjectId || typeof fetchedProjectId !== 'string' || fetchedProjectId.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Missing projectId' });
    }

    // TypeScript narrowing: assign to const with explicit string type
    const pid: string = fetchedProjectId;

    // Check ARC access (Option 2 = Leaderboard)
    const accessCheck = await requireArcAccess(supabase, pid, 2);
    if (!accessCheck.ok) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error,
      });
    }

    // Check follow verification
    if (!DEV_MODE) {
      const { data: verification } = await supabase
        .from('arc_project_follows')
        .select('verified_at')
        .eq('project_id', pid)
        .eq('profile_id', userProfile.profileId)
        .maybeSingle();

      if (!verification) {
        return res.status(200).json({
          ok: false,
          error: 'Follow verification required',
          reason: 'not_verified',
        });
      }
    }

    // Find active arena if not provided
    if (!arenaId) {
      const { data: activeArena, error: arenaError } = await supabase
        .from('arenas')
        .select('id')
        .eq('project_id', pid)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (arenaError || !activeArena) {
        return res.status(400).json({
          ok: false,
          error: 'No active arena found for this project',
          reason: 'no_active_arena',
        });
      }

      arenaId = activeArena.id;
    }

    // Runtime guard: ensure arenaId is a non-empty string
    if (!arenaId || typeof arenaId !== 'string' || arenaId.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Missing arenaId',
      });
    }

    // TypeScript narrowing: assign to const with explicit string type
    const aid: string = arenaId;

    // Check if user is already in this arena
    const { data: existingCreator, error: checkError } = await supabase
      .from('arena_creators')
      .select('id')
      .eq('arena_id', aid)
      .eq('profile_id', userProfile.profileId)
      .maybeSingle();

    if (existingCreator) {
      return res.status(200).json({
        ok: true,
        arenaId: aid,
        creatorId: existingCreator.id,
        message: 'Already joined this leaderboard',
      });
    }

    // Create arena_creators entry
    const { data: newCreator, error: createError } = await supabase
      .from('arena_creators')
      .insert({
        arena_id: aid,
        profile_id: userProfile.profileId,
        twitter_username: userProfile.twitterUsername,
        arc_points: 0,
        ring: 'discovery',
        style: null,
        meta: {},
      })
      .select('id')
      .single();

    if (createError) {
      console.error('[join-leaderboard] Error creating creator:', createError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to join leaderboard',
      });
    }

    return res.status(200).json({
      ok: true,
      arenaId: aid,
      creatorId: newCreator.id,
    });
  } catch (err: any) {
    console.error('[join-leaderboard] Error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Internal server error',
    });
  }
}

