/**
 * API Route: PATCH /api/portal/admin/projects/[id]
 * 
 * Updates project metadata.
 * - Super admins can edit all fields
 * - Project owners and admins can edit basic fields (name, slug, x_handle, twitter_username, header_image_url)
 * - System fields (is_active, arc_active, arc_access_level, profile_type) are super admin only
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface UpdateProjectBody {
  name?: string;
  slug?: string;
  x_handle?: string;
  twitter_username?: string;
  header_image_url?: string | null;
  is_active?: boolean;
  arc_active?: boolean;
  arc_access_level?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  profile_type?: 'personal' | 'project';
}

interface ProjectQueryResult {
  id: string;
  name: string;
  display_name: string | null;
  slug: string;
  x_handle: string;
  twitter_username: string | null;
  header_image_url?: string | null;
  is_active: boolean;
  arc_active?: boolean | null;
  arc_access_level?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' | null;
  profile_type?: 'personal' | 'project' | null;
}

interface AdminProject {
  id: string;
  name: string;
  display_name: string | null;
  slug: string;
  x_handle: string;
  twitter_username: string | null;
  header_image_url?: string | null;
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
    // AUTHENTICATION & PERMISSIONS
    // ==========================================================================
    let permissions: Awaited<ReturnType<typeof checkProjectPermissions>> | null = null;
    const projectId = typeof req.query.id === 'string' ? req.query.id : null;

    if (!projectId) {
      return res.status(400).json({ ok: false, error: 'Project ID is required' });
    }

    if (!DEV_MODE) {
      const portalUser = await requirePortalUser(req, res);
      if (!portalUser) {
        return; // requirePortalUser already sent the response
      }
      permissions = await checkProjectPermissions(supabase, portalUser.userId, projectId);
    } else {
      console.log('[Admin Projects API] DEV MODE - skipping auth');
    }

    // GET: Return project details
    if (req.method === 'GET') {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, name, display_name, slug, x_handle, twitter_username, header_image_url, is_active, arc_active, arc_access_level, profile_type')
        .eq('id', projectId)
        .single();

      if (projectError || !project) {
        return res.status(404).json({ ok: false, error: 'Project not found' });
      }

      const projectData = project as ProjectQueryResult;
      const adminProject: AdminProject = {
        id: projectData.id,
        name: projectData.name,
        display_name: projectData.display_name ?? null,
        slug: projectData.slug,
        x_handle: projectData.x_handle,
        twitter_username: projectData.twitter_username ?? null,
        header_image_url: projectData.header_image_url ?? null,
        is_active: projectData.is_active,
        arc_active: projectData.arc_active ?? undefined,
        arc_access_level: projectData.arc_access_level ?? undefined,
        profile_type: projectData.profile_type ?? undefined,
      };

      return res.status(200).json({
        ok: true,
        project: adminProject,
      });
    }

    // PATCH: Update project
    // Check permissions: project owners/admins can edit basic fields, super admins can edit all
    if (!DEV_MODE && !permissions) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const canManage = DEV_MODE || (permissions?.canManage ?? false);
    const isSuperAdmin = DEV_MODE || (permissions?.isSuperAdmin ?? false);

    if (!canManage) {
      return res.status(403).json({ ok: false, error: 'You do not have permission to update this project' });
    }

    const body = req.body as UpdateProjectBody;

    // Build update object (only include provided fields)
    const updateData: {
      name?: string;
      slug?: string;
      x_handle?: string;
      twitter_username?: string;
      header_image_url?: string | null;
      is_active?: boolean;
      arc_active?: boolean;
      arc_access_level?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
      profile_type?: 'personal' | 'project';
    } = {};

    // Basic fields that project owners/admins can edit
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
    if (body.header_image_url !== undefined) {
      updateData.header_image_url = body.header_image_url?.trim() || null;
    }

    // System fields that only super admins can edit
    if (body.is_active !== undefined) {
      if (!isSuperAdmin) {
        return res.status(403).json({ ok: false, error: 'Only super admins can update is_active' });
      }
      updateData.is_active = body.is_active;
    }
    if (body.arc_active !== undefined) {
      if (!isSuperAdmin) {
        return res.status(403).json({ ok: false, error: 'Only super admins can update arc_active' });
      }
      updateData.arc_active = body.arc_active;
    }
    if (body.arc_access_level !== undefined) {
      if (!isSuperAdmin) {
        return res.status(403).json({ ok: false, error: 'Only super admins can update arc_access_level' });
      }
      // Validate arc_access_level
      if (!['none', 'creator_manager', 'leaderboard', 'gamified'].includes(body.arc_access_level)) {
        return res.status(400).json({ ok: false, error: 'Invalid arc_access_level value' });
      }
      updateData.arc_access_level = body.arc_access_level;
    }
    if (body.profile_type !== undefined) {
      if (!isSuperAdmin) {
        return res.status(403).json({ ok: false, error: 'Only super admins can update profile_type' });
      }
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
      .eq('id', projectId)
      .select('id, name, display_name, slug, x_handle, twitter_username, header_image_url, is_active, arc_active, arc_access_level, profile_type')
      .single();

    if (updateError) {
      console.error('[Admin Projects API] Error updating project:', updateError);
      return res.status(500).json({ ok: false, error: updateError.message || 'Failed to update project' });
    }

    if (!updatedProject) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    const updatedProjectData = updatedProject as ProjectQueryResult;
    const adminProject: AdminProject = {
      id: updatedProjectData.id,
      name: updatedProjectData.name,
      display_name: updatedProjectData.display_name ?? null,
      slug: updatedProjectData.slug,
      x_handle: updatedProjectData.x_handle,
      twitter_username: updatedProjectData.twitter_username ?? null,
      header_image_url: updatedProjectData.header_image_url ?? null,
      is_active: updatedProjectData.is_active,
      arc_active: updatedProjectData.arc_active ?? undefined,
      arc_access_level: updatedProjectData.arc_access_level ?? undefined,
      profile_type: updatedProjectData.profile_type ?? undefined,
    };

    return res.status(200).json({
      ok: true,
      project: adminProject,
    });
  } catch (error: any) {
    console.error('[Admin Projects API] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

