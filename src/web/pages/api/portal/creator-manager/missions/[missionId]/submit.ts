/**
 * API Route: POST /api/portal/creator-manager/missions/[missionId]/submit
 * 
 * Creator endpoint: Submit a mission with post URL or tweet ID
 * 
 * Input: { postUrl?: string, postTweetId?: string, notes?: string }
 * 
 * Behavior:
 * - Check that current user is an approved creator in the program
 * - Create or update mission progress with status = "submitted"
 * 
 * Permissions: Only approved creators can submit missions
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { notifyProjectTeamMembers } from '@/lib/notifications';

// =============================================================================
// TYPES
// =============================================================================

interface SubmitMissionRequest {
  postUrl?: string;
  postTweetId?: string;
  notes?: string;
}

type SubmitMissionResponse =
  | { ok: true; message: string; progressId: string }
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

async function getCurrentUserProfile(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string): Promise<{ profileId: string; userId: string } | null> {
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
  const { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', session.user_id)
    .eq('provider', 'x')
    .single();

  if (!xIdentity?.username) {
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, real_roles')
    .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
    .single();

  if (!profile) {
    return null;
  }

  // Check if user has 'creator' role
  const hasCreatorRole = profile.real_roles?.includes('creator') || false;
  if (!hasCreatorRole) {
    return null; // Not a creator
  }

  return {
    profileId: profile.id,
    userId: session.user_id,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SubmitMissionResponse>
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
    return res.status(403).json({ ok: false, error: 'You must be a creator to submit missions' });
  }

  const missionId = req.query.missionId as string;
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'missionId is required' });
  }

  const body: SubmitMissionRequest = req.body;

  // Validate that at least postUrl or postTweetId is provided
  if (!body.postUrl && !body.postTweetId) {
    return res.status(400).json({ ok: false, error: 'Either postUrl or postTweetId is required' });
  }

  try {
    // Get mission to find program_id and program info
    const { data: mission, error: missionError } = await supabase
      .from('creator_manager_missions')
      .select('program_id, is_active')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
      return res.status(404).json({ ok: false, error: 'Mission not found' });
    }

    if (!mission.is_active) {
      return res.status(400).json({ ok: false, error: 'Mission is not active' });
    }

    // Get program to find project_id
    const { data: program, error: programError } = await supabase
      .from('creator_manager_programs')
      .select('project_id')
      .eq('id', mission.program_id)
      .single();

    if (programError || !program) {
      return res.status(404).json({ ok: false, error: 'Program not found' });
    }

    // Check that creator is approved in this program
    const { data: creator, error: creatorError } = await supabase
      .from('creator_manager_creators')
      .select('id, status')
      .eq('program_id', mission.program_id)
      .eq('creator_profile_id', currentUser.profileId)
      .single();

    if (creatorError || !creator) {
      return res.status(403).json({ ok: false, error: 'You are not a member of this program' });
    }

    if (creator.status !== 'approved') {
      return res.status(403).json({ ok: false, error: 'You must be an approved creator to submit missions' });
    }

    // Check if mission progress already exists
    const { data: existingProgress } = await supabase
      .from('creator_manager_mission_progress')
      .select('id, status')
      .eq('mission_id', missionId)
      .eq('creator_profile_id', currentUser.profileId)
      .eq('program_id', mission.program_id)
      .single();

    let progressId: string;

    if (existingProgress) {
      // Update existing progress
      const { data: updatedProgress, error: updateError } = await supabase
        .from('creator_manager_mission_progress')
        .update({
          status: 'submitted',
          post_url: body.postUrl || null,
          post_tweet_id: body.postTweetId || null,
          last_update_at: new Date().toISOString(),
        })
        .eq('id', existingProgress.id)
        .select('id')
        .single();

      if (updateError || !updatedProgress) {
        console.error('[Submit Mission] Error updating progress:', updateError);
        return res.status(500).json({ ok: false, error: 'Failed to update mission submission' });
      }

      progressId = updatedProgress.id;
    } else {
      // Create new progress
      const { data: newProgress, error: createError } = await supabase
        .from('creator_manager_mission_progress')
        .insert({
          mission_id: missionId,
          creator_profile_id: currentUser.profileId,
          program_id: mission.program_id,
          status: 'submitted',
          post_url: body.postUrl || null,
          post_tweet_id: body.postTweetId || null,
          last_update_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (createError || !newProgress) {
        console.error('[Submit Mission] Error creating progress:', createError);
        return res.status(500).json({ ok: false, error: 'Failed to submit mission' });
      }

      progressId = newProgress.id;
    }

    // Notify project team members (owners, admins, moderators)
    await notifyProjectTeamMembers(supabase, program.project_id, 'mission_submitted', {
      missionId,
      programId: mission.program_id,
      creatorProfileId: currentUser.profileId,
    });

    return res.status(200).json({
      ok: true,
      message: 'Mission submitted successfully',
      progressId,
    });
  } catch (error: any) {
    console.error('[Submit Mission] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

