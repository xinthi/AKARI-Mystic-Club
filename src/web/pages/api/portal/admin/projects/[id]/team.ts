/**
 * API Route: /api/portal/admin/projects/[id]/team
 * 
 * SuperAdmin-only endpoint for managing project team members.
 * Allows SuperAdmin to add/remove team members with any role.
 * 
 * GET: List team members for a project
 * POST: Add a team member (SuperAdmin only)
 * DELETE: Remove a team member (SuperAdmin only)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface AddTeamMemberRequest {
  profileId: string; // profiles.id (Twitter profile)
  role: 'owner' | 'admin' | 'moderator' | 'investor_view';
}

interface RemoveTeamMemberRequest {
  profileId: string;
  role: 'owner' | 'admin' | 'moderator' | 'investor_view';
}

interface TeamMember {
  id: string;
  project_id: string;
  profile_id: string;
  role: string;
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
// DEV MODE BYPASS
// =============================================================================

const DEV_MODE = process.env.NODE_ENV === 'development';

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

async function checkSuperAdmin(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<boolean> {
  try {
    // Check akari_user_roles table
    const { data: userRoles, error: rolesError } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin');

    if (rolesError) {
      console.error('[Admin Team Members API] Error checking akari_user_roles:', rolesError);
    } else if (userRoles && userRoles.length > 0) {
      return true;
    }

    // Also check profiles.real_roles via Twitter username
    const { data: xIdentity, error: identityError } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .single();

    if (identityError) {
      return false;
    }

    if (xIdentity?.username) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('real_roles')
        .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
        .single();

      if (profileError) {
        return false;
      }

      if (profile?.real_roles?.includes('super_admin')) {
        return true;
      }
    }

    return false;
  } catch (err: any) {
    console.error('[Admin Team Members API] Error in checkSuperAdmin:', err);
    return false;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TeamMembersResponse>
) {
  // Always set JSON content type
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const supabase = getSupabaseAdmin();

    // ==========================================================================
    // DEV MODE: Skip authentication in development
    // ==========================================================================
    if (!DEV_MODE) {
      // Get session token
      const sessionToken = getSessionToken(req);
      if (!sessionToken) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      // Validate session and get user ID
      const { data: session, error: sessionError } = await supabase
        .from('akari_user_sessions')
        .select('user_id, expires_at')
        .eq('session_token', sessionToken)
        .single();

      if (sessionError || !session) {
        return res.status(401).json({ ok: false, error: 'Invalid session' });
      }

      // Check if session is expired
      if (new Date(session.expires_at) < new Date()) {
        await supabase
          .from('akari_user_sessions')
          .delete()
          .eq('session_token', sessionToken);
        return res.status(401).json({ ok: false, error: 'Session expired' });
      }

      const userId = session.user_id;

      // Check if user is super admin
      const isSuperAdmin = await checkSuperAdmin(supabase, userId);
      if (!isSuperAdmin) {
        return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
      }
    } else {
      console.log('[Admin Team Members API] DEV MODE - skipping auth');
    }

  // Get project ID from URL
  const { id: projectId } = req.query;
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Project ID is required' });
  }

  // Verify project exists
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    return res.status(404).json({ ok: false, error: 'Project not found' });
  }

  // GET: List team members
  if (req.method === 'GET') {
    const { data: members, error: membersError } = await supabase
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
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (membersError) {
      console.error('[Admin Team Members API] Error fetching members:', membersError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch team members' });
    }

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

  // POST: Add team member
  if (req.method === 'POST') {
    const body: AddTeamMemberRequest = req.body;

    if (!body.profileId || !body.role) {
      return res.status(400).json({ ok: false, error: 'profileId and role are required' });
    }

    if (!['owner', 'admin', 'moderator', 'investor_view'].includes(body.role)) {
      return res.status(400).json({ ok: false, error: 'Invalid role' });
    }

    // Verify profile exists
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', body.profileId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ ok: false, error: 'Profile not found' });
    }

    // Check if team member already exists
    const { data: existing } = await supabase
      .from('project_team_members')
      .select('id')
      .eq('project_id', projectId)
      .eq('profile_id', body.profileId)
      .eq('role', body.role)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ ok: false, error: 'Team member with this role already exists' });
    }

    // Add team member
    const { error: insertError } = await supabase
      .from('project_team_members')
      .insert({
        project_id: projectId,
        profile_id: body.profileId,
        role: body.role,
      });

    if (insertError) {
      console.error('[Admin Team Members API] Error adding member:', insertError);
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
      .eq('project_id', projectId)
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

    if (!body.profileId || !body.role) {
      return res.status(400).json({ ok: false, error: 'profileId and role are required' });
    }

    // Remove team member
    const { error: deleteError } = await supabase
      .from('project_team_members')
      .delete()
      .eq('project_id', projectId)
      .eq('profile_id', body.profileId)
      .eq('role', body.role);

    if (deleteError) {
      console.error('[Admin Team Members API] Error removing member:', deleteError);
      return res.status(500).json({ ok: false, error: 'Failed to remove team member' });
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
      .eq('project_id', projectId)
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

