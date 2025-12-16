/**
 * API Route: /api/portal/creator-manager/programs/[programId]/missions
 * 
 * GET: List missions for a program
 * POST: Create a new mission
 * 
 * Permissions: Only project admins and moderators can create missions
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface CreateMissionRequest {
  title: string;
  description?: string;
  reward_arc_min?: number;
  reward_arc_max?: number;
  reward_xp?: number;
  is_active?: boolean;
  order_index?: number;
}

interface Mission {
  id: string;
  program_id: string;
  title: string;
  description: string | null;
  reward_arc_min: number;
  reward_arc_max: number;
  reward_xp: number;
  is_active: boolean;
  order_index: number;
  created_at: string;
}

type MissionsResponse =
  | { ok: true; missions: Mission[] }
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
  res: NextApiResponse<MissionsResponse>
) {
  const supabase = getSupabaseAdmin();

  const programId = req.query.programId as string;
  if (!programId) {
    return res.status(400).json({ ok: false, error: 'programId is required' });
  }

  // GET: List missions
  if (req.method === 'GET') {
    try {
      const { data: missions, error: missionsError } = await supabase
        .from('creator_manager_missions')
        .select('*')
        .eq('program_id', programId)
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true });

      if (missionsError) {
        console.error('[Creator Manager Missions] Error fetching missions:', missionsError);
        return res.status(500).json({ ok: false, error: 'Failed to fetch missions' });
      }

      return res.status(200).json({ ok: true, missions: missions || [] });
    } catch (error: any) {
      console.error('[Creator Manager Missions] Error:', error);
      return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
    }
  }

  // POST: Create mission
  if (req.method === 'POST') {
    const body: CreateMissionRequest = req.body;

    if (!body.title) {
      return res.status(400).json({ ok: false, error: 'title is required' });
    }

    // Get current user
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const currentUser = await getCurrentUser(supabase, sessionToken);
    if (!currentUser) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    try {
      // Get program to find project_id
      const { data: program, error: programError } = await supabase
        .from('creator_manager_programs')
        .select('project_id')
        .eq('id', programId)
        .single();

      if (programError || !program) {
        return res.status(404).json({ ok: false, error: 'Program not found' });
      }

      // Check permissions
      const permissions = await checkProjectPermissions(supabase, currentUser.userId, program.project_id);
      if (!permissions.isAdmin && !permissions.isModerator && !permissions.isOwner && !permissions.isSuperAdmin) {
        return res.status(403).json({ ok: false, error: 'Only project admins and moderators can create missions' });
      }

      // Get max order_index to append new mission
      const { data: existingMissions } = await supabase
        .from('creator_manager_missions')
        .select('order_index')
        .eq('program_id', programId)
        .order('order_index', { ascending: false })
        .limit(1);

      const maxOrderIndex = existingMissions && existingMissions.length > 0
        ? (existingMissions[0] as any).order_index
        : -1;

      // Create mission
      const { data: mission, error: createError } = await supabase
        .from('creator_manager_missions')
        .insert({
          program_id: programId,
          title: body.title,
          description: body.description || null,
          reward_arc_min: body.reward_arc_min || 0,
          reward_arc_max: body.reward_arc_max || 0,
          reward_xp: body.reward_xp || 0,
          is_active: body.is_active !== undefined ? body.is_active : true,
          order_index: body.order_index !== undefined ? body.order_index : maxOrderIndex + 1,
        })
        .select()
        .single();

      if (createError) {
        console.error('[Creator Manager Missions] Error creating mission:', createError);
        return res.status(500).json({ ok: false, error: 'Failed to create mission' });
      }

      return res.status(201).json({ ok: true, missions: [mission] });
    } catch (error: any) {
      console.error('[Creator Manager Missions] Error:', error);
      return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
    }
  }

  // PATCH: Update mission (for is_active toggle)
  if (req.method === 'PATCH') {
    const body: { missionId: string; is_active?: boolean } = req.body;

    if (!body.missionId) {
      return res.status(400).json({ ok: false, error: 'missionId is required' });
    }

    // Get current user
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const currentUser = await getCurrentUser(supabase, sessionToken);
    if (!currentUser) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    try {
      // Get mission to find program
      const { data: mission, error: missionError } = await supabase
        .from('creator_manager_missions')
        .select('program_id')
        .eq('id', body.missionId)
        .eq('program_id', programId)
        .single();

      if (missionError || !mission) {
        return res.status(404).json({ ok: false, error: 'Mission not found' });
      }

      // Get program to find project_id
      const { data: program, error: programError } = await supabase
        .from('creator_manager_programs')
        .select('project_id')
        .eq('id', programId)
        .single();

      if (programError || !program) {
        return res.status(404).json({ ok: false, error: 'Program not found' });
      }

      // Check permissions
      const permissions = await checkProjectPermissions(supabase, currentUser.userId, program.project_id);
      if (!permissions.isAdmin && !permissions.isModerator && !permissions.isOwner && !permissions.isSuperAdmin) {
        return res.status(403).json({ ok: false, error: 'Only project admins and moderators can update missions' });
      }

      // Update mission
      const updateData: Record<string, any> = {};
      if (body.is_active !== undefined) {
        updateData.is_active = body.is_active;
      }

      const { error: updateError } = await supabase
        .from('creator_manager_missions')
        .update(updateData)
        .eq('id', body.missionId);

      if (updateError) {
        console.error('[Creator Manager Missions] Error updating mission:', updateError);
        return res.status(500).json({ ok: false, error: 'Failed to update mission' });
      }

      // Return updated mission
      const { data: updatedMission } = await supabase
        .from('creator_manager_missions')
        .select('*')
        .eq('id', body.missionId)
        .single();

      return res.status(200).json({ ok: true, missions: updatedMission ? [updatedMission] : [] });
    } catch (error: any) {
      console.error('[Creator Manager Missions] Error:', error);
      return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

