/**
 * API Route: POST /api/portal/creator-manager/missions/[missionId]/review
 * 
 * Moderator endpoint: Approve or reject a mission submission
 * 
 * Input: { creatorProfileId: string, action: 'approve' | 'reject' }
 * 
 * Behavior:
 * - If approve: status = "approved", award XP and ARC points
 * - If reject: status = "rejected"
 * 
 * Permissions: Only project owner/admin/moderator can review missions
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkProjectPermissions } from '@/lib/project-permissions';
import { addArcPointsForCreatorManager } from '@/lib/arc/creator-manager-scoring';
import { createNotification } from '@/lib/notifications';

// =============================================================================
// TYPES
// =============================================================================

interface ReviewMissionRequest {
  creatorProfileId: string;
  action: 'approve' | 'reject';
}

type MissionProgressStatus = 'in_progress' | 'submitted' | 'approved' | 'rejected';

type ReviewMissionResponse =
  | {
      ok: true;
      message: string;
      progress: {
        id: string;
        status: MissionProgressStatus;
        last_update_at: string;
      };
      creator?: {
        xp: number;
        arc_points: number;
      };
    }
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
  res: NextApiResponse<ReviewMissionResponse>
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

  const body: ReviewMissionRequest = req.body;
  if (!body.creatorProfileId || !body.action) {
    return res.status(400).json({ ok: false, error: 'creatorProfileId and action are required' });
  }
  
  // Validate action is 'approve' or 'reject'
  if (body.action !== 'approve' && body.action !== 'reject') {
    return res.status(400).json({ ok: false, error: 'action must be "approve" or "reject"' });
  }

  try {
    // Get mission to find program_id and rewards
    const { data: mission, error: missionError } = await supabase
      .from('creator_manager_missions')
      .select('program_id, reward_arc_min, reward_arc_max, reward_xp')
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
      return res.status(403).json({ ok: false, error: 'Only project admins and moderators can review missions' });
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
      return res.status(404).json({ ok: false, error: 'Mission submission not found' });
    }

    // Validate progress.status is a valid MissionProgressStatus
    const validStatuses: MissionProgressStatus[] = ['in_progress', 'submitted', 'approved', 'rejected'];
    const progressStatus = progress.status as MissionProgressStatus;
    if (!validStatuses.includes(progressStatus)) {
      return res.status(500).json({ ok: false, error: 'Invalid mission status' });
    }

    // Compute target status and check if already in that state
    const targetStatus: MissionProgressStatus = body.action === 'approve' ? 'approved' : 'rejected';
    if (progressStatus === targetStatus) {
      return res.status(400).json({ ok: false, error: `Mission is already ${targetStatus}` });
    }

    // Update mission progress status
    const newStatus: MissionProgressStatus = body.action === 'approve' ? 'approved' : 'rejected';
    const { data: updatedProgress, error: updateProgressError } = await supabase
      .from('creator_manager_mission_progress')
      .update({
        status: newStatus,
        last_update_at: new Date().toISOString(),
      })
      .eq('id', progress.id)
      .select('id, status, last_update_at')
      .single();

    if (updateProgressError || !updatedProgress) {
      console.error('[Review Mission] Error updating progress:', updateProgressError);
      return res.status(500).json({ ok: false, error: 'Failed to update mission status' });
    }

    let creatorUpdate: { xp: number; arc_points: number } | undefined;

    // If approved, award XP and ARC points
    if (body.action === 'approve') {
      // Get current creator record
      const { data: creator, error: creatorError } = await supabase
        .from('creator_manager_creators')
        .select('xp, arc_points')
        .eq('program_id', mission.program_id)
        .eq('creator_profile_id', body.creatorProfileId)
        .single();

      if (creatorError || !creator) {
        console.error('[Review Mission] Error fetching creator:', creatorError);
        // Continue without awarding rewards
      } else {
        const rewardXp = mission.reward_xp || 0;
        const rewardArc = mission.reward_arc_min || 0; // Use min as base, can be enhanced later

        const newXp = (creator.xp || 0) + rewardXp;

        // Update creator XP
        const { error: updateXpError } = await supabase
          .from('creator_manager_creators')
          .update({ xp: newXp })
          .eq('program_id', mission.program_id)
          .eq('creator_profile_id', body.creatorProfileId);

        if (updateXpError) {
          console.error('[Review Mission] Error updating XP:', updateXpError);
        }

        // Award ARC points using shared helper
        let newArcPoints = creator.arc_points || 0;
        if (rewardArc > 0) {
          const arcResult = await addArcPointsForCreatorManager(
            mission.program_id,
            body.creatorProfileId,
            rewardArc
          );

          if (!arcResult.success) {
            console.error('[Review Mission] Error awarding ARC points:', arcResult.error);
          } else {
            newArcPoints = arcResult.newTotalPoints;
          }
        }

        creatorUpdate = {
          xp: newXp,
          arc_points: newArcPoints,
        };
      }
    }

    // Create notification for creator
    const notificationType = body.action === 'approve' ? 'mission_approved' : 'mission_rejected';
    await createNotification(supabase, body.creatorProfileId, notificationType, {
      missionId,
      programId: mission.program_id,
      projectId: program.project_id,
    });

    return res.status(200).json({
      ok: true,
      message: `Mission ${body.action === 'approve' ? 'approved' : 'rejected'} successfully`,
      progress: {
        id: updatedProgress.id,
        status: updatedProgress.status,
        last_update_at: updatedProgress.last_update_at,
      },
      creator: creatorUpdate,
    });
  } catch (error: any) {
    console.error('[Review Mission] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

