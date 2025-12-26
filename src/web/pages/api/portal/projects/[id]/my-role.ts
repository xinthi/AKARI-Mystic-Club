/**
 * API Route: GET /api/portal/projects/[id]/my-role
 * 
 * Returns the current user's role for a specific project.
 * Used as a fallback to check admin/moderator permissions.
 * Returns { ok: true, role: 'owner' | 'admin' | 'moderator' | null, isOwner: boolean }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// DEV MODE: Skip authentication in development
const DEV_MODE = process.env.NODE_ENV === 'development';

// =============================================================================
// TYPES
// =============================================================================

type MyRoleResponse =
  | { ok: true; role: 'owner' | 'admin' | 'moderator' | null; isOwner: boolean }
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

async function getCurrentUser(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string) {
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

  return { userId: session.user_id };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MyRoleResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { id: projectId } = req.query;
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ ok: false, error: 'projectId is required' });
  }

  // ==========================================================================
  // DEV MODE: Return admin role in development
  // ==========================================================================
  if (DEV_MODE) {
    console.log('[My Role API] DEV MODE - returning admin role');
    return res.status(200).json({ ok: true, role: 'admin', isOwner: false });
  }

  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(200).json({ ok: true, role: null, isOwner: false });
  }

  try {
    const supabase = getSupabaseAdmin();
    const currentUser = await getCurrentUser(supabase, sessionToken);
    
    if (!currentUser) {
      return res.status(200).json({ ok: true, role: null, isOwner: false });
    }

    // Check if user is project owner
    const { data: project } = await supabase
      .from('projects')
      .select('claimed_by')
      .eq('id', projectId)
      .single();

    if (project?.claimed_by === currentUser.userId) {
      return res.status(200).json({ ok: true, role: 'owner', isOwner: true });
    }

    // Get user's Twitter username
    const { data: xIdentity } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', currentUser.userId)
      .eq('provider', 'x')
      .single();

    if (!xIdentity?.username) {
      return res.status(200).json({ ok: true, role: null, isOwner: false });
    }

    // Get profile ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
      .single();

    if (!profile) {
      return res.status(200).json({ ok: true, role: null, isOwner: false });
    }

    // Check project_team_members for admin or moderator role
    const { data: teamMembers } = await supabase
      .from('project_team_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('profile_id', profile.id)
      .in('role', ['admin', 'moderator']);

    if (teamMembers && teamMembers.length > 0) {
      // Return the first matching role (admin takes precedence if both exist)
      const roles = teamMembers.map(m => m.role);
      const role = roles.includes('admin') ? 'admin' : 'moderator';
      return res.status(200).json({ ok: true, role, isOwner: false });
    }

    return res.status(200).json({ ok: true, role: null, isOwner: false });
  } catch (error: any) {
    console.error('[My Role API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

