/**
 * API Route: POST /api/portal/arc/verify-follow
 * 
 * Verifies that the current user follows the project's X account.
 * Used for Option 2 (Normal Leaderboard) join flow.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { requirePortalUser } from '@/lib/server/require-portal-user';

// =============================================================================
// TYPES
// =============================================================================

interface VerifyFollowBody {
  projectId: string;
}

type VerifyFollowResponse =
  | { ok: true; verified: boolean; verifiedAt: string | null }
  | { ok: false; error: string; reason?: 'not_following' | 'not_authenticated' | 'project_not_found' | 'x_identity_not_found' | 'profile_not_found' | 'profile_creation_failed' };

// =============================================================================
// DEV MODE BYPASS
// =============================================================================

const DEV_MODE = process.env.NODE_ENV === 'development';

// =============================================================================
// HELPERS
// =============================================================================

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

    // Authentication using shared helper
    const portalUser = await requirePortalUser(req, res);
    if (!portalUser) {
      return; // requirePortalUser already sent 401 response with debug headers
    }

    // Get Twitter username for profile lookup
    // Note: profileId may be null, so we need to look up X identity
    const { data: xIdentity, error: identityError } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', portalUser.userId)
      .eq('provider', 'x')
      .maybeSingle();

    if (identityError || !xIdentity?.username) {
      // X identity is required for verify-follow, but don't fail auth
      return res.status(400).json({
        ok: false,
        error: 'X identity not found',
        reason: 'not_authenticated',
      });
    }

    const cleanUsername = xIdentity.username.toLowerCase().replace('@', '').trim();
    
    // Use profileId from portalUser if available, otherwise look it up or create it
    let profileId: string;
    if (portalUser.profileId) {
      profileId = portalUser.profileId;
    } else {
      // Fallback: look up profile by username
      let profile = await supabase
        .from('profiles')
        .select('id')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (!profile.data) {
        // Profile doesn't exist - auto-create it with minimal data
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            username: cleanUsername,
            name: cleanUsername, // Use username as name fallback
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (createError || !newProfile) {
          console.error('[verify-follow] Failed to create profile:', createError);
          return res.status(500).json({
            ok: false,
            error: 'Failed to create profile',
            reason: 'profile_creation_failed',
          });
        }

        profileId = newProfile.id;
      } else {
        profileId = profile.data.id;
      }
    }

    const userProfile = { profileId, twitterUsername: cleanUsername };

    // Parse body
    const body = req.body as VerifyFollowBody;
    if (!body.projectId || typeof body.projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    // Runtime guard: ensure projectId is a non-empty string
    if (!body.projectId || typeof body.projectId !== 'string' || body.projectId.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Missing projectId' });
    }

    // TypeScript narrowing: assign to const with explicit string type
    const pid: string = body.projectId;

    // Check ARC access (Option 2 = Leaderboard)
    const accessCheck = await requireArcAccess(supabase, pid, 2);
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
      .eq('id', pid)
      .single();

    if (projectError || !project) {
      return res.status(404).json({
        ok: false,
        error: 'Project not found',
        reason: 'project_not_found',
      });
    }

    // Check database first for existing verification
    const { data: existingVerification } = await supabase
      .from('arc_project_follows')
      .select('verified_at')
      .eq('project_id', pid)
      .eq('profile_id', userProfile.profileId)
      .maybeSingle();

    if (existingVerification) {
      // Already verified - return existing verification
      return res.status(200).json({
        ok: true,
        verified: true,
        verifiedAt: existingVerification.verified_at,
      });
    }

    // No existing verification - for v1, this is manual verification
    // When user clicks "Verify Follow", we create the verification record
    // (X API check is not implemented yet, so we trust the user's manual action)
    // In future, we can add X API check here before creating the record
    
    // For now, create verification record when user clicks "Verify Follow"
    // This is the v1 manual verification flow
    const { data: verification, error: insertError } = await supabase
      .from('arc_project_follows')
      .insert({
        project_id: pid,
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

