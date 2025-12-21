/**
 * API Route: POST /api/portal/arc/verify-follow
 * 
 * Verifies that the current user follows the project's X account.
 * Used for Option 2 (Normal Leaderboard) join flow.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';

// =============================================================================
// TYPES
// =============================================================================

interface VerifyFollowBody {
  projectId: string;
}

type VerifyFollowResponse =
  | { ok: true; verified: boolean; verifiedAt: string | null }
  | { ok: false; error: string; reason?: 'not_following' | 'not_authenticated' | 'project_not_found' };

// =============================================================================
// DEV MODE BYPASS
// =============================================================================

const DEV_MODE = process.env.NODE_ENV === 'development';

// =============================================================================
// HELPERS
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

/**
 * Check if user follows project's X account
 * In DEV MODE, always returns true
 */
async function checkUserFollowsProject(
  userTwitterUsername: string,
  projectXHandle: string | null
): Promise<boolean> {
  if (DEV_MODE) {
    return true; // DEV MODE bypass
  }

  if (!projectXHandle) {
    return true; // No handle to check
  }

  // TODO: Implement real X API follow check
  // For now, return false to require verification
  // In production, this should call X API to verify follow status
  return false;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VerifyFollowResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Authentication
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({
        ok: false,
        error: 'Not authenticated',
        reason: 'not_authenticated',
      });
    }

    const userProfile = await getCurrentUserProfile(supabase, sessionToken);
    if (!userProfile) {
      return res.status(401).json({
        ok: false,
        error: 'Invalid session',
        reason: 'not_authenticated',
      });
    }

    // Parse body
    const body = req.body as VerifyFollowBody;
    if (!body.projectId || typeof body.projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    // Check ARC access (Option 2 = Leaderboard)
    const accessCheck = await requireArcAccess(supabase, body.projectId, 2);
    if (!accessCheck.ok) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error,
      });
    }

    // Get project X handle
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, x_handle')
      .eq('id', body.projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({
        ok: false,
        error: 'Project not found',
        reason: 'project_not_found',
      });
    }

    // Check if user follows project
    const userFollows = await checkUserFollowsProject(
      userProfile.twitterUsername,
      project.x_handle
    );

    if (!userFollows) {
      return res.status(200).json({
        ok: true,
        verified: false,
        verifiedAt: null,
      });
    }

    // Store verification in DB
    const { data: existingVerification } = await supabase
      .from('arc_project_follows')
      .select('verified_at')
      .eq('project_id', body.projectId)
      .eq('profile_id', userProfile.profileId)
      .maybeSingle();

    if (existingVerification) {
      return res.status(200).json({
        ok: true,
        verified: true,
        verifiedAt: existingVerification.verified_at,
      });
    }

    // Insert new verification
    const { data: verification, error: insertError } = await supabase
      .from('arc_project_follows')
      .insert({
        project_id: body.projectId,
        profile_id: userProfile.profileId,
        twitter_username: userProfile.twitterUsername,
        verified_at: new Date().toISOString(),
      })
      .select('verified_at')
      .single();

    if (insertError) {
      console.error('[verify-follow] Error inserting verification:', insertError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to save verification',
      });
    }

    return res.status(200).json({
      ok: true,
      verified: true,
      verifiedAt: verification.verified_at,
    });
  } catch (err: any) {
    console.error('[verify-follow] Error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Internal server error',
    });
  }
}

