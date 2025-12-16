/**
 * API Route: POST /api/portal/creator-manager/missions/[missionId]/approve
 * 
 * Approve a mission for a creator and award XP.
 * 
 * Input: { creatorProfileId: string }
 * 
 * Behavior:
 * - Marks mission progress as status = "approved"
 * - Adds mission.reward_xp to creator_manager_creators.xp
 * 
 * Permissions: Only project admin/moderator can approve missions
 * 
 * TODO: Connect this to sentiment and engagement based ARC scoring engine
 * TODO: Auto-approve missions based on engagement metrics
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface ApproveMissionRequest {
  creatorProfileId: string;
}

type ApproveMissionResponse =
  | { ok: true; message: string; xpAwarded: number; newXp: number }
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

async function getCurrentUser(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string): Promise<{ userId: string } | null> {
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

  return {
    userId: session.user_id,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApproveMissionResponse>
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

  const currentUser = await getCurrentUser(supabase, sessionToken);
  if (!currentUser) {
    return res.status(401).json({ ok: false, error: 'Invalid session' });
  }

  const missionId = req.query.missionId as string;
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'missionId is required' });
  }

  const body: ApproveMissionRequest = req.body;
  if (!body.creatorProfileId) {
    return res.status(400).json({ ok: false, error: 'creatorProfileId is required' });
  }

  try {
    // Get mission to find program and reward_xp
    const { data: mission, error: missionError } = await supabase
      .from('creator_manager_missions')
      .select('program_id, reward_xp')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
      return res.status(404).json({ ok: false, error: 'Mission not found' });
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

    // Check permissions
    const permissions = await checkProjectPermissions(supabase, currentUser.userId, program.project_id);
    if (!permissions.isAdmin && !permissions.isModerator && !permissions.isOwner && !permissions.isSuperAdmin) {
      return res.status(403).json({
        ok: false,
        error: 'Only project admins and moderators can approve missions',
      });
    }

    // Get mission progress
    const { data: progress, error: progressError } = await supabase
      .from('creator_manager_mission_progress')
      .select('id, status')
      .eq('mission_id', missionId)
      .eq('creator_profile_id', body.creatorProfileId)
      .eq('program_id', mission.program_id)
      .single();

    if (progressError || !progress) {
      return res.status(404).json({
        ok: false,
        error: 'Mission progress not found for this creator',
      });
    }

    // Check if already approved
    if (progress.status === 'approved') {
      return res.status(400).json({
        ok: false,
        error: 'Mission is already approved',
      });
    }

    // Get current creator record
    const { data: creator, error: creatorError } = await supabase
      .from('creator_manager_creators')
      .select('xp')
      .eq('program_id', mission.program_id)
      .eq('creator_profile_id', body.creatorProfileId)
      .single();

    if (creatorError || !creator) {
      return res.status(404).json({
        ok: false,
        error: 'Creator not found in this program',
      });
    }

    const rewardXp = mission.reward_xp || 0;
    const newXp = (creator.xp || 0) + rewardXp;

    // Update mission progress status
    const { error: updateProgressError } = await supabase
      .from('creator_manager_mission_progress')
      .update({
        status: 'approved',
        last_update_at: new Date().toISOString(),
      })
      .eq('id', progress.id);

    if (updateProgressError) {
      console.error('[Approve Mission] Error updating progress:', updateProgressError);
      return res.status(500).json({ ok: false, error: 'Failed to update mission progress' });
    }

    // Update creator XP
    const { error: updateXpError } = await supabase
      .from('creator_manager_creators')
      .update({ xp: newXp })
      .eq('program_id', mission.program_id)
      .eq('creator_profile_id', body.creatorProfileId);

    if (updateXpError) {
      console.error('[Approve Mission] Error updating XP:', updateXpError);
      // Try to rollback mission progress status
      await supabase
        .from('creator_manager_mission_progress')
        .update({ status: progress.status })
        .eq('id', progress.id);
      return res.status(500).json({ ok: false, error: 'Failed to award XP' });
    }

    return res.status(200).json({
      ok: true,
      message: 'Mission approved and XP awarded',
      xpAwarded: rewardXp,
      newXp,
    });
  } catch (error: any) {
    console.error('[Approve Mission] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

