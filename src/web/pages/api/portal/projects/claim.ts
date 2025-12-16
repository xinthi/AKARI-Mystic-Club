/**
 * API Route: POST /api/portal/projects/claim
 * 
 * Allows a logged-in user to claim a project if their Twitter username matches the project's twitter_username.
 * 
 * Flow:
 * 1. User must be logged in
 * 2. User's Twitter username (from akari_user_identities) must match projects.twitter_username
 * 3. If match is found, project is claimed:
 *    - projects.claimed_by = user.id
 *    - projects.claimed_at = now()
 *    - project_admin role is added to akari_user_roles if not already present
 *    - Owner role is added to project_team_members
 * 
 * Request body:
 *   - projectId: UUID of the project to claim (required)
 * 
 * Returns success status and project data.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface ClaimRequest {
  projectId: string;
}

type ClaimResponse =
  | { ok: true; project: any; message: string }
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

async function getCurrentUser(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string): Promise<{ userId: string; xUsername: string | null } | null> {
  // Find session
  const { data: session, error: sessionError } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (sessionError || !session) {
    return null;
  }

  // Check if session is expired
  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    return null;
  }

  // Get X identity for username
  const { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', session.user_id)
    .eq('provider', 'x')
    .single();

  return {
    userId: session.user_id,
    xUsername: xIdentity?.username || null,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ClaimResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body: ClaimRequest = req.body;

    // Validate required fields
    if (!body.projectId || typeof body.projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
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

    if (!currentUser.xUsername) {
      return res.status(400).json({ ok: false, error: 'No Twitter account linked. Please connect your X/Twitter account first.' });
    }

    // Get project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', body.projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    // Check if project is already claimed
    if (project.claimed_by) {
      // Check if it's claimed by the same user
      if (project.claimed_by === currentUser.userId) {
        return res.status(200).json({
          ok: true,
          project,
          message: 'Project is already claimed by you',
        });
      }
      return res.status(400).json({ ok: false, error: 'Project is already claimed by another user' });
    }

    // Check if user's Twitter username matches project's twitter_username
    const userTwitterUsername = currentUser.xUsername.toLowerCase().replace('@', '').trim();
    const projectTwitterUsername = (project.twitter_username || project.x_handle || '').toLowerCase().replace('@', '').trim();

    if (userTwitterUsername !== projectTwitterUsername) {
      return res.status(403).json({
        ok: false,
        error: `Twitter username mismatch. Your account (@${currentUser.xUsername}) does not match this project (@${project.twitter_username || project.x_handle}). Only the official project account can claim this project.`,
      });
    }

    // Claim the project
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        claimed_by: currentUser.userId,
        claimed_at: now,
      })
      .eq('id', body.projectId);

    if (updateError) {
      console.error('[Claim Project] Update error:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to claim project' });
    }

    // Add project_admin role to akari_user_roles if not already present
    const { data: existingRoles } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', currentUser.userId)
      .eq('role', 'project_admin');

    if (!existingRoles || existingRoles.length === 0) {
      const { error: roleError } = await supabase
        .from('akari_user_roles')
        .insert({
          user_id: currentUser.userId,
          role: 'project_admin',
        });

      if (roleError) {
        console.warn('[Claim Project] Failed to add project_admin role:', roleError);
        // Don't fail the claim - role can be added manually
      }
    }

    // Add owner role to project_team_members
    // First, get the profile_id for this user's Twitter username
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', userTwitterUsername)
      .single();

    if (profile) {
      // Check if team member already exists
      const { data: existingTeamMember } = await supabase
        .from('project_team_members')
        .select('id')
        .eq('project_id', body.projectId)
        .eq('profile_id', profile.id)
        .eq('role', 'owner')
        .single();

      if (!existingTeamMember) {
        const { error: teamError } = await supabase
          .from('project_team_members')
          .insert({
            project_id: body.projectId,
            profile_id: profile.id,
            role: 'owner',
          });

        if (teamError) {
          console.warn('[Claim Project] Failed to add owner to project_team_members:', teamError);
          // Don't fail the claim - team member can be added manually
        }
      }
    } else {
      console.warn('[Claim Project] Profile not found for username:', userTwitterUsername);
      // Don't fail - profile might not exist in profiles table yet
    }

    // Get updated project
    const { data: updatedProject } = await supabase
      .from('projects')
      .select('*')
      .eq('id', body.projectId)
      .single();

    return res.status(200).json({
      ok: true,
      project: updatedProject,
      message: 'Project claimed successfully',
    });
  } catch (error: any) {
    console.error('[Claim Project] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

