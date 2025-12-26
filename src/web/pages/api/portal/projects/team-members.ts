/**
 * API Route: /api/portal/projects/team-members
 * 
 * Manages project team members (owners, admins, moderators, investor_view).
 * 
 * GET: List team members for a project
 * POST: Add a team member (requires owner or admin role)
 * DELETE: Remove a team member (requires owner or admin role, or super_admin for security)
 * 
 * Security:
 * - Only project owner (projects.claimed_by) or admins can add/remove moderators and admins
 * - SuperAdmin can only remove team members (for security reasons), cannot add new ones
 * - When a moderator is removed by super_admin, all ARC campaigns and Creator Manager programs are paused
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface AddTeamMemberRequest {
  projectId: string;
  profileId: string; // profiles.id (Twitter profile)
  role: 'owner' | 'admin' | 'moderator' | 'investor_view';
}

interface RemoveTeamMemberRequest {
  projectId: string;
  profileId: string;
  role: 'owner' | 'admin' | 'moderator' | 'investor_view';
}

interface TeamMember {
  id: string;
  project_id: string;
  profile_id: string;
  role: string;
  affiliate_title: string | null;
  created_at: string;
  profile?: {
    id: string;
    username: string;
    name: string | null;
    profile_image_url: string | null;
  };
}

type TeamMembersResponse =
  | { ok: true; members: TeamMember[] }
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

  return {
    userId: session.user_id,
    xUsername: xIdentity?.username || null,
  };
}

async function checkSuperAdmin(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<boolean> {
  const { data: roles } = await supabase
    .from('akari_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');

  return (roles?.length ?? 0) > 0;
}

/**
 * Check if user has permission to manage team members for a project
 * Returns: { canManage: boolean; isOwner: boolean; isAdmin: boolean; isSuperAdmin: boolean }
 */
async function checkTeamManagementPermission(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  projectId: string
): Promise<{ canManage: boolean; isOwner: boolean; isAdmin: boolean; isSuperAdmin: boolean }> {
  const isSuperAdmin = await checkSuperAdmin(supabase, userId);

  // Get project
  const { data: project } = await supabase
    .from('projects')
    .select('claimed_by')
    .eq('id', projectId)
    .single();

  if (!project) {
    return { canManage: false, isOwner: false, isAdmin: false, isSuperAdmin };
  }

  const isOwner = project.claimed_by === userId;

  // Get user's Twitter username to find their profile
  const { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', userId)
    .eq('provider', 'x')
    .single();

  let isAdmin = false;
  if (xIdentity?.username) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
      .single();

    if (profile) {
      const { data: teamMember } = await supabase
        .from('project_team_members')
        .select('role')
        .eq('project_id', projectId)
        .eq('profile_id', profile.id)
        .eq('role', 'admin')
        .single();

      isAdmin = !!teamMember;
    }
  }

  const canManage = isOwner || isAdmin || isSuperAdmin;

  return { canManage, isOwner, isAdmin, isSuperAdmin };
}

/**
 * Pause all ARC campaigns and Creator Manager programs for a project
 * 
 * TODO: Expand to full freeze mode later. Currently:
 * - Sets arenas status to 'cancelled' (temporary solution)
 * - Should add 'paused' status to arenas table in future migration
 * - Creator Manager programs will be paused when that system is implemented
 */
async function pauseProjectCampaigns(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  projectId: string
): Promise<void> {
  // Pause ARC campaigns (arenas)
  // TODO: Add 'paused' status to arenas.status enum in future migration
  // For now, we use 'cancelled' as a workaround
  const { error: arenasError } = await supabase
    .from('arenas')
    .update({ status: 'cancelled' })
    .eq('project_id', projectId)
    .in('status', ['draft', 'scheduled', 'active']);

  if (arenasError) {
    console.error('[Team Members] Error pausing arenas:', arenasError);
  }

  // TODO: Pause Creator Manager programs when that system is implemented
  // For now, we just pause arenas
  console.log(`[Team Members] Paused campaigns for project ${projectId} (status set to 'cancelled' as temporary solution)`);
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TeamMembersResponse>
) {
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

  // GET: List team members
  if (req.method === 'GET') {
    const projectId = req.query.projectId as string;
    if (!projectId) {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    const { data: members, error: membersError } = await supabase
      .from('project_team_members')
      .select(`
        id,
        project_id,
        profile_id,
        role,
        affiliate_title,
        created_at,
        profiles:profile_id (
          id,
          username,
          name,
          profile_image_url
        )
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (membersError) {
      console.error('[Team Members] Error fetching members:', membersError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch team members' });
    }

    return res.status(200).json({
      ok: true,
      members: (members || []).map((m: any) => ({
        id: m.id,
        project_id: m.project_id,
        profile_id: m.profile_id,
        role: m.role,
        affiliate_title: m.affiliate_title,
        created_at: m.created_at,
        profile: m.profiles ? {
          id: m.profiles.id,
          username: m.profiles.username,
          name: m.profiles.name,
          profile_image_url: m.profiles.profile_image_url,
        } : undefined,
      })),
    });
  }

  // POST: Add team member
  if (req.method === 'POST') {
    const body: AddTeamMemberRequest = req.body;

    if (!body.projectId || !body.profileId || !body.role) {
      return res.status(400).json({ ok: false, error: 'projectId, profileId, and role are required' });
    }

    if (!['owner', 'admin', 'moderator', 'investor_view'].includes(body.role)) {
      return res.status(400).json({ ok: false, error: 'Invalid role' });
    }

    // Check permissions
    const permission = await checkTeamManagementPermission(supabase, currentUser.userId, body.projectId);
    
    // SuperAdmin cannot add team members (only remove for security)
    if (permission.isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'SuperAdmin can only remove team members for security reasons, not add them' });
    }

    if (!permission.canManage) {
      return res.status(403).json({ ok: false, error: 'You do not have permission to manage team members for this project' });
    }

    // Only owner can add owner role
    if (body.role === 'owner' && !permission.isOwner) {
      return res.status(403).json({ ok: false, error: 'Only the project owner can assign owner role' });
    }

    // Check if team member already exists
    const { data: existing } = await supabase
      .from('project_team_members')
      .select('id')
      .eq('project_id', body.projectId)
      .eq('profile_id', body.profileId)
      .eq('role', body.role)
      .single();

    if (existing) {
      return res.status(400).json({ ok: false, error: 'Team member with this role already exists' });
    }

    // Add team member
    const { error: insertError } = await supabase
      .from('project_team_members')
      .insert({
        project_id: body.projectId,
        profile_id: body.profileId,
        role: body.role,
        affiliate_title: body.affiliate_title || null,
      });

    if (insertError) {
      console.error('[Team Members] Error adding member:', insertError);
      return res.status(500).json({ ok: false, error: 'Failed to add team member' });
    }

    // Return updated list
    const { data: members } = await supabase
      .from('project_team_members')
      .select(`
        id,
        project_id,
        profile_id,
        role,
        created_at,
        profiles:profile_id (
          id,
          username,
          name,
          profile_image_url
        )
      `)
      .eq('project_id', body.projectId)
      .order('created_at', { ascending: true });

    return res.status(200).json({
      ok: true,
      members: (members || []).map((m: any) => ({
        id: m.id,
        project_id: m.project_id,
        profile_id: m.profile_id,
        role: m.role,
        created_at: m.created_at,
        profile: m.profiles ? {
          id: m.profiles.id,
          username: m.profiles.username,
          name: m.profiles.name,
          profile_image_url: m.profiles.profile_image_url,
        } : undefined,
      })),
    });
  }

  // DELETE: Remove team member
  if (req.method === 'DELETE') {
    const body: RemoveTeamMemberRequest = req.body;

    if (!body.projectId || !body.profileId || !body.role) {
      return res.status(400).json({ ok: false, error: 'projectId, profileId, and role are required' });
    }

    // Check permissions
    const permission = await checkTeamManagementPermission(supabase, currentUser.userId, body.projectId);

    if (!permission.canManage) {
      return res.status(403).json({ ok: false, error: 'You do not have permission to manage team members for this project' });
    }

    // Only owner can remove owner role
    if (body.role === 'owner' && !permission.isOwner && !permission.isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'Only the project owner or SuperAdmin can remove owner role' });
    }

    // Remove team member
    const { error: deleteError } = await supabase
      .from('project_team_members')
      .delete()
      .eq('project_id', body.projectId)
      .eq('profile_id', body.profileId)
      .eq('role', body.role);

    if (deleteError) {
      console.error('[Team Members] Error removing member:', deleteError);
      return res.status(500).json({ ok: false, error: 'Failed to remove team member' });
    }

    // If a moderator was removed by super_admin, pause campaigns
    if (body.role === 'moderator' && permission.isSuperAdmin) {
      await pauseProjectCampaigns(supabase, body.projectId);
    }

    // Return updated list
    const { data: members } = await supabase
      .from('project_team_members')
      .select(`
        id,
        project_id,
        profile_id,
        role,
        created_at,
        profiles:profile_id (
          id,
          username,
          name,
          profile_image_url
        )
      `)
      .eq('project_id', body.projectId)
      .order('created_at', { ascending: true });

    return res.status(200).json({
      ok: true,
      members: (members || []).map((m: any) => ({
        id: m.id,
        project_id: m.project_id,
        profile_id: m.profile_id,
        role: m.role,
        created_at: m.created_at,
        profile: m.profiles ? {
          id: m.profiles.id,
          username: m.profiles.username,
          name: m.profiles.name,
          profile_image_url: m.profiles.profile_image_url,
        } : undefined,
      })),
    });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

