/**
 * API Route: POST /api/portal/creator-manager/programs/[programId]/creators/apply
 * 
 * Creator endpoint: Apply to a public or hybrid Creator Manager program.
 * 
 * Creates or updates creator_manager_creators with status = 'pending'.
 * 
 * Auth: Must be logged in and have 'creator' in profiles.real_roles
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkArcProjectApproval } from '@/lib/arc-permissions';

const DEV_MODE = process.env.NODE_ENV === 'development';

// =============================================================================
// TYPES
// =============================================================================

type ApplyResponse =
  | { ok: true; message: string }
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

  const { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', session.user_id)
    .eq('provider', 'x')
    .single();

  if (!xIdentity?.username) {
    return null;
  }

  const cleanUsername = xIdentity.username.toLowerCase().replace('@', '').trim();
  let { data: profile } = await supabase
    .from('profiles')
    .select('id, real_roles')
    .eq('username', cleanUsername)
    .maybeSingle();

  if (!profile) {
    const { data: newProfile, error: createError } = await supabase
      .from('profiles')
      .insert({
        username: cleanUsername,
        name: cleanUsername,
        real_roles: ['user'],
        updated_at: new Date().toISOString(),
      })
      .select('id, real_roles')
      .single();

    if (createError || !newProfile) {
      return null;
    }
    profile = newProfile;
  }

  // Ensure creator role is present for CRM participation
  if (!profile.real_roles?.includes('creator')) {
    const nextRoles = [...(profile.real_roles || []), 'creator'];
    await supabase
      .from('profiles')
      .update({ real_roles: nextRoles })
      .eq('id', profile.id);
  }

  return {
    profileId: profile.id,
    twitterUsername: cleanUsername,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApplyResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();

  // Get current user
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  const currentUser = await getCurrentUserProfile(supabase, sessionToken);
  if (!currentUser) {
    return res.status(403).json({ ok: false, error: 'You must be a creator to apply to programs' });
  }

  const programId = req.query.programId as string;
  if (!programId) {
    return res.status(400).json({ ok: false, error: 'programId is required' });
  }

  try {
    // Get program to check visibility and status
    const { data: program, error: programError } = await supabase
      .from('creator_manager_programs')
      .select('visibility, status, project_id')
      .eq('id', programId)
      .single();

    if (programError || !program) {
      return res.status(404).json({ ok: false, error: 'Program not found' });
    }

    // Check ARC approval for the project
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

    // Check if program is active
    if (program.status !== 'active') {
      return res.status(400).json({ ok: false, error: 'Program is not accepting applications' });
    }

    // Verify follow before allowing application (skip in dev)
    if (!DEV_MODE) {
      const { data: verification } = await supabase
        .from('arc_project_follows')
        .select('id')
        .eq('project_id', program.project_id)
        .or(`profile_id.eq.${currentUser.profileId},twitter_username.eq.${currentUser.twitterUsername}`)
        .maybeSingle();

      if (!verification) {
        return res.status(403).json({
          ok: false,
          error: 'Please verify you follow the project on X before applying',
        });
      }
    }

    // Check if creator is already in the program
    const { data: existingCreator } = await supabase
      .from('creator_manager_creators')
      .select('id, status')
      .eq('program_id', programId)
      .eq('creator_profile_id', currentUser.profileId)
      .single();

    if (existingCreator) {
      // Update status to pending if it was rejected or removed
      if (existingCreator.status === 'rejected' || existingCreator.status === 'removed') {
        const { error: updateError } = await supabase
          .from('creator_manager_creators')
          .update({ status: 'pending' })
          .eq('id', existingCreator.id);

        if (updateError) {
          console.error('[Apply to Program] Error updating status:', updateError);
          return res.status(500).json({ ok: false, error: 'Failed to apply' });
        }

        return res.status(200).json({
          ok: true,
          message: 'Application submitted successfully',
        });
      }

      return res.status(400).json({
        ok: false,
        error: `You are already ${existingCreator.status} in this program`,
      });
    }

    // Create new application
    const { error: insertError } = await supabase
      .from('creator_manager_creators')
      .insert({
        program_id: programId,
        creator_profile_id: currentUser.profileId,
        status: 'pending',
      });

    if (insertError) {
      console.error('[Apply to Program] Error inserting application:', insertError);
      return res.status(500).json({ ok: false, error: 'Failed to apply' });
    }

    return res.status(200).json({
      ok: true,
      message: 'Application submitted successfully',
    });
  } catch (error: any) {
    console.error('[Apply to Program] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

