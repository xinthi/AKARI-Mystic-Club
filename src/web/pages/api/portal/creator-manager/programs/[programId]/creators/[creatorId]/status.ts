/**
 * API Route: POST /api/portal/creator-manager/programs/[programId]/creators/[creatorId]/status
 * 
 * Admin/moderator endpoint: Change creator status and optionally assign a deal.
 * 
 * Input: { status: 'pending' | 'approved' | 'rejected' | 'removed', dealId?: string }
 * 
 * Permissions: Only project admins and moderators can change status
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface UpdateStatusRequest {
  status: 'pending' | 'approved' | 'rejected' | 'removed';
  dealId?: string;
}

type UpdateStatusResponse =
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

async function getCurrentUser(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string): Promise<{ userId: string; profileId: string | null } | null> {
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

  let profileId: string | null = null;
  if (xIdentity?.username) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
      .single();
    profileId = profile?.id || null;
  }

  return {
    userId: session.user_id,
    profileId,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdateStatusResponse>
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
  const creatorId = req.query.creatorId as string;

  if (!programId || !creatorId) {
    return res.status(400).json({ ok: false, error: 'programId and creatorId are required' });
  }

  const body: UpdateStatusRequest = req.body;
  if (!body.status || !['pending', 'approved', 'rejected', 'removed'].includes(body.status)) {
    return res.status(400).json({ ok: false, error: 'Invalid status' });
  }

  try {
    // Get creator record to find program
    const { data: creator, error: creatorError } = await supabase
      .from('creator_manager_creators')
      .select('program_id')
      .eq('id', creatorId)
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

    // Check permissions - must be admin or moderator
    const permissions = await checkProjectPermissions(supabase, currentUser.userId, program.project_id);
    if (!permissions.isAdmin && !permissions.isModerator && !permissions.isOwner && !permissions.isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'Only project admins and moderators can change creator status' });
    }

    // If dealId is provided, verify it belongs to this program
    if (body.dealId) {
      const { data: deal, error: dealError } = await supabase
        .from('creator_manager_deals')
        .select('id')
        .eq('id', body.dealId)
        .eq('program_id', programId)
        .single();

      if (dealError || !deal) {
        return res.status(400).json({ ok: false, error: 'Invalid deal ID' });
      }
    }

    // Update creator status
    const updateData: Record<string, any> = {
      status: body.status,
    };

    if (body.dealId) {
      updateData.deal_id = body.dealId;
    } else if (body.status === 'rejected' || body.status === 'removed') {
      // Clear deal if rejected or removed
      updateData.deal_id = null;
    }

    const { error: updateError } = await supabase
      .from('creator_manager_creators')
      .update(updateData)
      .eq('id', creatorId);

    if (updateError) {
      console.error('[Update Creator Status] Error:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to update creator status' });
    }

    // If status is approved, ensure creator has 'creator' role in profiles.real_roles
    if (body.status === 'approved') {
      const { data: creatorProfile } = await supabase
        .from('creator_manager_creators')
        .select('creator_profile_id')
        .eq('id', creatorId)
        .single();

      if (creatorProfile) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('real_roles')
          .eq('id', creatorProfile.creator_profile_id)
          .single();

        if (profile && (!profile.real_roles || !profile.real_roles.includes('creator'))) {
          const updatedRoles = profile.real_roles ? [...profile.real_roles, 'creator'] : ['creator'];
          await supabase
            .from('profiles')
            .update({ real_roles: updatedRoles })
            .eq('id', creatorProfile.creator_profile_id);
        }
      }
    }

    return res.status(200).json({
      ok: true,
      message: `Creator status updated to ${body.status}`,
    });
  } catch (error: any) {
    console.error('[Update Creator Status] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

