/**
 * API Route: PATCH /api/portal/creator-manager/programs/[programId]
 * 
 * Update program status (active, paused, ended)
 * 
 * Input: { status: 'active' | 'paused' | 'ended' }
 * 
 * Permissions:
 * - Owner/Admin: Can change to any status
 * - Moderator: Can pause/resume (active <-> paused) but cannot end
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface UpdateProgramRequest {
  status: 'active' | 'paused' | 'ended';
}

type UpdateProgramResponse =
  | { ok: true; message: string; program: { id: string; status: string } }
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
  res: NextApiResponse<UpdateProgramResponse>
) {
  if (req.method !== 'PATCH') {
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

  const programId = req.query.programId as string;
  if (!programId) {
    return res.status(400).json({ ok: false, error: 'programId is required' });
  }

  const body: UpdateProgramRequest = req.body;
  if (!body.status || !['active', 'paused', 'ended'].includes(body.status)) {
    return res.status(400).json({ ok: false, error: 'status must be "active", "paused", or "ended"' });
  }

  try {
    // Get program to find project_id and current status
    const { data: program, error: programError } = await supabase
      .from('creator_manager_programs')
      .select('project_id, status')
      .eq('id', programId)
      .single();

    if (programError || !program) {
      return res.status(404).json({ ok: false, error: 'Program not found' });
    }

    // Check permissions
    const permissions = await checkProjectPermissions(supabase, currentUser.userId, program.project_id);
    if (!permissions.canManage) {
      return res.status(403).json({ ok: false, error: 'Only project admins and moderators can update program status' });
    }

    // Check if moderator is trying to end program (not allowed)
    if (body.status === 'ended' && !permissions.isOwner && !permissions.isAdmin && !permissions.isSuperAdmin) {
      // Moderator can only pause/resume, not end
      return res.status(403).json({ ok: false, error: 'Only project owners and admins can end a program' });
    }

    // Update program status
    const { data: updatedProgram, error: updateError } = await supabase
      .from('creator_manager_programs')
      .update({ status: body.status })
      .eq('id', programId)
      .select('id, status')
      .single();

    if (updateError) {
      console.error('[Update Program Status] Error:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to update program status' });
    }

    return res.status(200).json({
      ok: true,
      message: `Program status updated to ${body.status}`,
      program: {
        id: updatedProgram.id,
        status: updatedProgram.status,
      },
    });
  } catch (error: any) {
    console.error('[Update Program Status] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

