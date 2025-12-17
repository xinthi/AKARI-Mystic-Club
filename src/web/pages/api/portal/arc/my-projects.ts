/**
 * API Route: GET /api/portal/arc/my-projects
 * 
 * Returns projects where the current user can request ARC access
 * (owner, admin, moderator, or super admin)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface MyProject {
  id: string;
  name: string;
  display_name: string | null;
  slug: string | null;
  twitter_username: string | null;
  x_handle: string | null;
  avatar_url: string | null;
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' | null;
  arc_active: boolean;
}

type MyProjectsResponse =
  | { ok: true; projects: MyProject[] }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

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
  res: NextApiResponse<MyProjectsResponse>
) {
  // Always set JSON content type
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get current user from session
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const currentUser = await getCurrentUser(supabase, sessionToken);
    if (!currentUser) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired session' });
    }

    // Get all projects
    const { data: projectsData, error: projectsError } = await supabase
      .from('projects')
      .select('id, name, display_name, slug, twitter_username, x_handle, avatar_url, arc_access_level, arc_active')
      .order('name');

    if (projectsError) {
      console.error('[My Projects API] Error fetching projects:', projectsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch projects' });
    }

    // Filter projects where user can request ARC access
    const myProjects: MyProject[] = [];

    for (const project of projectsData || []) {
      const permissions = await checkProjectPermissions(
        supabase,
        currentUser.userId,
        project.id
      );

      // User can request if they are owner, admin, moderator, or super admin
      if (permissions.isOwner || permissions.isAdmin || permissions.isModerator || permissions.isSuperAdmin) {
        myProjects.push({
          id: project.id,
          name: project.name,
          display_name: project.display_name,
          slug: project.slug,
          twitter_username: project.twitter_username,
          x_handle: project.x_handle,
          avatar_url: project.avatar_url,
          arc_access_level: project.arc_access_level,
          arc_active: project.arc_active,
        });
      }
    }

    return res.status(200).json({ ok: true, projects: myProjects });
  } catch (error: any) {
    console.error('[My Projects API] Error:', error);

    // Check for Supabase configuration errors
    if (error.message?.includes('Missing Supabase') || error.message?.includes('configuration')) {
      return res.status(503).json({
        ok: false,
        error: 'Service configuration error. Please contact support.',
      });
    }

    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch projects',
    });
  }
}

