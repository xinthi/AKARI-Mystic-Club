/**
 * API Route: GET /api/portal/arc/follow-status?projectId=UUID
 * 
 * Checks if the current user has verified follow status for a project.
 * Read-only endpoint - does not write anything.
 * Used for Option 2 (Normal Leaderboard) join flow.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthUser } from '@/lib/server/get-auth-user';

// =============================================================================
// TYPES
// =============================================================================

type FollowStatusResponse =
  | { ok: true; verified: boolean }
  | { ok: false; error: string; reason?: 'not_authenticated' | 'project_not_found' };

// =============================================================================
// DEV MODE BYPASS
// =============================================================================

const DEV_MODE = process.env.NODE_ENV === 'development';

// =============================================================================
// HELPERS
// =============================================================================

async function getCurrentUserProfile(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<{ profileId: string; twitterUsername: string } | null> {
  // Get user's Twitter username
  const { data: xIdentity, error: identityError } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', userId)
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

async function getDevSuperAdminUserId(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<string | null> {
  const { data: superAdminRole } = await supabase
    .from('akari_user_roles')
    .select('user_id')
    .eq('role', 'super_admin')
    .limit(1)
    .maybeSingle();

  if (superAdminRole) {
    return superAdminRole.user_id;
  }

  const { data: anyUser } = await supabase
    .from('akari_users')
    .select('id')
    .limit(1)
    .maybeSingle();

  return anyUser?.id || null;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FollowStatusResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      return res.status(400).json({ ok: false, error: 'Invalid projectId format' });
    }

    // Check if project exists
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ ok: false, error: 'Project not found', reason: 'project_not_found' });
    }

    // Authentication
    let userProfile: { profileId: string; twitterUsername: string } | null = null;

    if (!DEV_MODE) {
      const authUser = await getAuthUser(req);
      if (!authUser) {
        // Log for debugging
        if (process.env.NODE_ENV === 'production') {
          console.log('[follow-status] Authentication failed', {
            hasAuthHeader: !!req.headers.authorization,
            hasCookie: !!req.headers.cookie,
          });
        }
        return res.status(401).json({ ok: false, error: 'Not authenticated', reason: 'not_authenticated' });
      }

      userProfile = await getCurrentUserProfile(supabase, authUser.userId);
      if (!userProfile) {
        // Log for debugging
        if (process.env.NODE_ENV === 'production') {
          console.log('[follow-status] User profile lookup failed', {
            userId: authUser.userId,
            method: authUser.method,
          });
        }
        return res.status(401).json({ ok: false, error: 'Invalid session', reason: 'not_authenticated' });
      }
    } else {
      // DEV MODE: Find a user to use for checking
      const devUserId = await getDevSuperAdminUserId(supabase);
      if (devUserId) {
        const { data: xIdentity } = await supabase
          .from('akari_user_identities')
          .select('username')
          .eq('user_id', devUserId)
          .eq('provider', 'x')
          .single();

        if (xIdentity?.username) {
          const cleanUsername = xIdentity.username.toLowerCase().replace('@', '').trim();
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', cleanUsername)
            .single();

          if (profile) {
            userProfile = { profileId: profile.id, twitterUsername: cleanUsername };
          }
        }
      }

      // In DEV MODE, if no user found, return verified: false (not an error)
      if (!userProfile) {
        return res.status(200).json({ ok: true, verified: false });
      }
    }

    // Check if user has verified follow in arc_project_follows table
    const { data: verification, error: verificationError } = await supabase
      .from('arc_project_follows')
      .select('id')
      .eq('project_id', projectId)
      .eq('profile_id', userProfile.profileId)
      .maybeSingle();

    if (verificationError) {
      console.error('[follow-status] Error checking verification:', verificationError);
      // If table doesn't exist or error, return false (not verified)
      return res.status(200).json({ ok: true, verified: false });
    }

    const verified = !!verification;

    return res.status(200).json({ ok: true, verified });
  } catch (err: any) {
    console.error('[follow-status] Error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Internal server error',
    });
  }
}

