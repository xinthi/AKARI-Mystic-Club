/**
 * API Route: PATCH /api/portal/admin/projects/[id]
 * 
 * Updates project metadata for super admin.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface UpdateProjectBody {
  name?: string;
  slug?: string;
  x_handle?: string;
  twitter_username?: string;
  is_active?: boolean;
  arc_active?: boolean;
  arc_access_level?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  profile_type?: 'personal' | 'project';
}

interface AdminProject {
  id: string;
  name: string;
  display_name: string | null;
  slug: string;
  x_handle: string;
  twitter_username: string | null;
  is_active: boolean;
  arc_active?: boolean;
  arc_access_level?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  profile_type?: 'personal' | 'project';
}

type UpdateProjectResponse =
  | {
      ok: true;
      project: AdminProject;
    }
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
  const { data: roles } = await supabase
    .from('akari_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');

  return (roles?.length ?? 0) > 0;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdateProjectResponse>
) {
  // Always set JSON content type
  res.setHeader('Content-Type', 'application/json');
  
  // Support both GET and PATCH
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // ==========================================================================
    // DEV MODE: Skip authentication in development
    // ==========================================================================
    if (!DEV_MODE) {
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
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
    } else {
      console.log('[Admin Projects API] DEV MODE - skipping auth');
    }

    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Project ID is required' });
    }

    // GET: Return project details
    if (req.method === 'GET') {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, name, display_name, slug, x_handle, twitter_username, is_active, arc_active, arc_access_level, profile_type')
        .eq('id', id)
        .single();

      if (projectError || !project) {
        return res.status(404).json({ ok: false, error: 'Project not found' });
      }

      return res.status(200).json({
        ok: true,
        project: {
          id: project.id,
          name: project.name,
          display_name: project.display_name,
          slug: project.slug,
          x_handle: project.x_handle,
          twitter_username: project.twitter_username,
          is_active: project.is_active,
          arc_active: project.arc_active,
          arc_access_level: project.arc_access_level,
          profile_type: project.profile_type,
        },
      });
    }

    const body = req.body as UpdateProjectBody;

    // Build update object (only include provided fields)
    const updateData: {
      name?: string;
      slug?: string;
      x_handle?: string;
      twitter_username?: string;
      is_active?: boolean;
      arc_active?: boolean;
      arc_access_level?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
      profile_type?: 'personal' | 'project';
    } = {};

    if (body.name !== undefined) {
      updateData.name = body.name.trim();
    }
    if (body.slug !== undefined) {
      updateData.slug = body.slug.trim();
    }
    if (body.x_handle !== undefined) {
      updateData.x_handle = body.x_handle.trim();
      // Also update twitter_username if x_handle is provided
      updateData.twitter_username = body.x_handle.trim();
    }
    if (body.twitter_username !== undefined) {
      updateData.twitter_username = body.twitter_username.trim();
      // Also update x_handle if twitter_username is provided
      updateData.x_handle = body.twitter_username.trim();
    }
    if (body.is_active !== undefined) {
      updateData.is_active = body.is_active;
    }
    if (body.arc_active !== undefined) {
      updateData.arc_active = body.arc_active;
    }
    if (body.arc_access_level !== undefined) {
      // Validate arc_access_level
      if (!['none', 'creator_manager', 'leaderboard', 'gamified'].includes(body.arc_access_level)) {
        return res.status(400).json({ ok: false, error: 'Invalid arc_access_level value' });
      }
      updateData.arc_access_level = body.arc_access_level;
    }
    if (body.profile_type !== undefined) {
      // Validate profile_type
      if (!['personal', 'project'].includes(body.profile_type)) {
        return res.status(400).json({ ok: false, error: 'Invalid profile_type value' });
      }
      updateData.profile_type = body.profile_type;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ ok: false, error: 'No fields to update' });
    }

    // Update project
    const { data: updatedProject, error: updateError } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', id)
      .select('id, name, slug, x_handle, is_active, arc_active, arc_access_level, profile_type')
      .single();

    if (updateError) {
      console.error('[Admin Projects API] Error updating project:', updateError);
      return res.status(500).json({ ok: false, error: updateError.message || 'Failed to update project' });
    }

    if (!updatedProject) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    return res.status(200).json({
      ok: true,
      project: {
        id: updatedProject.id,
        name: updatedProject.name,
        slug: updatedProject.slug,
        x_handle: updatedProject.x_handle,
        is_active: updatedProject.is_active,
        arc_active: updatedProject.arc_active,
        arc_access_level: updatedProject.arc_access_level,
        profile_type: updatedProject.profile_type,
      },
    });
  } catch (error: any) {
    console.error('[Admin Projects API] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

