/**
 * API Route: PATCH /api/portal/projects/[id]/team-member/[memberId]
 * 
 * Update team member affiliate title
 * Requires project admin/moderator permissions
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { checkProjectPermissions } from '@/lib/project-permissions';

type UpdateResponse =
  | { ok: true; affiliate_title: string | null }
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
    const { id: projectId, memberId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Project ID is required' });
    }

    if (!memberId || typeof memberId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Member ID is required' });
    }

    // Check permissions
    const permissions = await checkProjectPermissions(supabase, portalUser.userId, projectId);
    const canManage = permissions.isSuperAdmin || permissions.isOwner || permissions.isAdmin || permissions.isModerator;
    
    if (!canManage) {
      return res.status(403).json({ ok: false, error: 'You do not have permission to update team members' });
    }

    const body = req.body as { affiliate_title?: string | null };
    const affiliateTitle = body.affiliate_title || null;

    // Verify member belongs to this project
    const { data: member, error: memberError } = await supabase
      .from('project_team_members')
      .select('id, project_id')
      .eq('id', memberId)
      .eq('project_id', projectId)
      .single();

    if (memberError || !member) {
      return res.status(404).json({ ok: false, error: 'Team member not found' });
    }

    // Update affiliate title
    const { data: updated, error: updateError } = await supabase
      .from('project_team_members')
      .update({ affiliate_title: affiliateTitle })
      .eq('id', memberId)
      .select('affiliate_title')
      .single();

    if (updateError) {
      console.error('[Team Member Update API] Error:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to update affiliate title' });
    }

    return res.status(200).json({
      ok: true,
      affiliate_title: updated?.affiliate_title || null,
    });
  } catch (error: any) {
    console.error('[Team Member Update API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

