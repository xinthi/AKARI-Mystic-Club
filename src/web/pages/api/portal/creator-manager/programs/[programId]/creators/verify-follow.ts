/**
 * API Route: POST /api/portal/creator-manager/programs/[programId]/creators/verify-follow
 *
 * Verifies that the current user follows the project's X account for CRM.
 * Creates a record in arc_project_follows (manual verification flow).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { checkArcProjectApproval } from '@/lib/arc-permissions';

interface VerifyFollowResponse {
  ok: boolean;
  verified?: boolean;
  verifiedAt?: string | null;
  error?: string;
}

const DEV_MODE = process.env.NODE_ENV === 'development';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VerifyFollowResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { programId } = req.query;

    if (!programId || typeof programId !== 'string') {
      return res.status(400).json({ ok: false, error: 'programId is required' });
    }

    const portalUser = await requirePortalUser(req, res);
    if (!portalUser) {
      return;
    }

    // Get X identity
    let { data: xIdentity } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', portalUser.userId)
      .in('provider', ['x', 'twitter'])
      .maybeSingle();

    if (!xIdentity?.username) {
      const { data: fallbackIdentity } = await supabase
        .from('akari_user_identities')
        .select('username')
        .eq('user_id', portalUser.userId)
        .not('username', 'is', null)
        .maybeSingle();
      xIdentity = fallbackIdentity || xIdentity;
    }

    if (!xIdentity?.username) {
      return res.status(400).json({ ok: false, error: 'X identity not found' });
    }

    const cleanUsername = xIdentity.username.toLowerCase().replace('@', '').trim();
    if (!cleanUsername) {
      return res.status(400).json({ ok: false, error: 'X username is empty' });
    }

    // Resolve or create profile
    let profileId = portalUser.profileId;
    if (!profileId) {
      let { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (!existingProfile) {
        const { data: existingCaseInsensitive } = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', cleanUsername)
          .maybeSingle();
        existingProfile = existingCaseInsensitive || existingProfile;
      }

      if (existingProfile?.id) {
        profileId = existingProfile.id;
      } else {
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            username: cleanUsername,
            name: cleanUsername,
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (createError || !newProfile) {
          // Retry select in case of unique conflicts/race
          const { data: retryProfile } = await supabase
            .from('profiles')
            .select('id')
            .ilike('username', cleanUsername)
            .maybeSingle();

          if (retryProfile?.id) {
            profileId = retryProfile.id;
          } else {
            return res.status(500).json({
              ok: false,
              error: createError?.message || 'Failed to create profile',
            });
          }
        } else {
          profileId = newProfile.id;
        }
      }
    }

    // Get program + project
    const { data: program, error: programError } = await supabase
      .from('creator_manager_programs')
      .select('project_id')
      .eq('id', programId)
      .single();

    if (programError || !program) {
      return res.status(404).json({ ok: false, error: 'Program not found' });
    }

    // Check ARC approval for CRM
    const approval = await checkArcProjectApproval(supabase, program.project_id);
    if (!approval.isApproved) {
      return res.status(403).json({
        ok: false,
        error: approval.isPending
          ? 'ARC access is pending approval for this project'
          : approval.isRejected
          ? 'ARC access was rejected for this project'
          : 'ARC access has not been approved for this project',
      });
    }

    // Return existing verification if found
    const { data: existingVerification } = await supabase
      .from('arc_project_follows')
      .select('verified_at')
      .eq('project_id', program.project_id)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (existingVerification) {
      return res.status(200).json({
        ok: true,
        verified: true,
        verifiedAt: existingVerification.verified_at,
      });
    }

    if (!DEV_MODE) {
      // TODO: Implement real X API follow check
      // For now, we allow manual verification in production as well.
    }

    const { data: verification, error: insertError } = await supabase
      .from('arc_project_follows')
      .insert({
        project_id: program.project_id,
        profile_id: profileId,
        twitter_username: cleanUsername,
        verified_at: new Date().toISOString(),
      })
      .select('verified_at')
      .single();

    if (insertError) {
      return res.status(500).json({ ok: false, error: 'Failed to save verification' });
    }

    return res.status(200).json({
      ok: true,
      verified: true,
      verifiedAt: verification?.verified_at || null,
    });
  } catch (err: any) {
    console.error('[CRM verify-follow] Error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
}
