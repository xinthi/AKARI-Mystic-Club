/**
 * API Route: POST /api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId]/class
 * 
 * Update creator class in a Creator Manager program.
 * 
 * Input: { class: "Vanguard" | "Analyst" | "Amplifier" | "Explorer" | null }
 * 
 * Permissions: Only project owner/admin/moderator can update class
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkProjectPermissions } from '@/lib/project-permissions';
import { isValidClass, CREATOR_CLASSES } from '@/lib/creator-gamification';

// =============================================================================
// TYPES
// =============================================================================

interface UpdateClassRequest {
  class: 'Vanguard' | 'Analyst' | 'Amplifier' | 'Explorer' | null;
}

type UpdateClassResponse =
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
  res: NextApiResponse<UpdateClassResponse>
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

  const programId = req.query.programId as string;
  const creatorProfileId = req.query.creatorProfileId as string;

  if (!programId || !creatorProfileId) {
    return res.status(400).json({ ok: false, error: 'programId and creatorProfileId are required' });
  }

  const body: UpdateClassRequest = req.body;
  
  // Validate class (can be null to clear class)
  if (body.class !== null && !isValidClass(body.class)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid class. Must be one of: ${CREATOR_CLASSES.join(', ')}`,
    });
  }

  try {
    // Verify creator exists in this program
    const { data: creator, error: creatorError } = await supabase
      .from('creator_manager_creators')
      .select('program_id')
      .eq('creator_profile_id', creatorProfileId)
      .eq('program_id', programId)
      .single();

    if (creatorError || !creator) {
      return res.status(404).json({ ok: false, error: 'Creator not found in this program' });
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

    // Check permissions - must be admin, moderator, or owner
    const permissions = await checkProjectPermissions(supabase, currentUser.userId, program.project_id);
    if (!permissions.isAdmin && !permissions.isModerator && !permissions.isOwner && !permissions.isSuperAdmin) {
      return res.status(403).json({
        ok: false,
        error: 'Only project admins and moderators can update creator class',
      });
    }

    // Update creator class using creator_profile_id and program_id
    const { error: updateError } = await supabase
      .from('creator_manager_creators')
      .update({ class: body.class })
      .eq('creator_profile_id', creatorProfileId)
      .eq('program_id', programId);

    if (updateError) {
      console.error('[Update Creator Class] Error:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to update creator class' });
    }

    return res.status(200).json({
      ok: true,
      message: body.class ? `Creator class updated to ${body.class}` : 'Creator class cleared',
    });
  } catch (error: any) {
    console.error('[Update Creator Class] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

