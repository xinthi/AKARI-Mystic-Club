/**
 * API Route: PATCH /api/portal/projects/[id]/header-image
 * 
 * Update project header image URL
 * Requires project admin/moderator permissions
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { checkProjectPermissions } from '@/lib/project-permissions';

type UpdateResponse =
  | { ok: true; header_image_url: string | null }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdateResponse>
) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const portalUser = await requirePortalUser(req, res);
    if (!portalUser) {
      return;
    }

    const supabase = getSupabaseAdmin();
    const { id: projectId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Project ID is required' });
    }

    // Check permissions
    const permissions = await checkProjectPermissions(supabase, portalUser.userId, projectId);
    const canManage = permissions.isSuperAdmin || permissions.isOwner || permissions.isAdmin || permissions.isModerator;
    
    if (!canManage) {
      return res.status(403).json({ ok: false, error: 'You do not have permission to update this project' });
    }

    const body = req.body as { header_image_url?: string | null };
    const headerImageUrl = body.header_image_url || null;

    // Update project
    const { data: updated, error: updateError } = await supabase
      .from('projects')
      .update({ header_image_url: headerImageUrl })
      .eq('id', projectId)
      .select('header_image_url')
      .single();

    if (updateError) {
      console.error('[Project Header Image API] Error:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to update header image' });
    }

    return res.status(200).json({
      ok: true,
      header_image_url: updated?.header_image_url || null,
    });
  } catch (error: any) {
    console.error('[Project Header Image API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

