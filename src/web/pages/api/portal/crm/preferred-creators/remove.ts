/**
 * API Route: POST /api/portal/crm/preferred-creators/remove
 * 
 * Remove a creator from project's preferred creators list
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type RemovePreferredCreatorResponse =
  | {
      ok: true;
      message: string;
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RemovePreferredCreatorResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const user = await requirePortalUser(req, res);
    if (!user) {
      return; // requirePortalUser already sent 401 response
    }
    const profileId = user.profileId;
    if (!profileId) {
      return res.status(403).json({ ok: false, error: 'Profile not found' });
    }
    const supabase = createPortalClient();

    const { projectId, creatorProfileId } = req.body;

    if (!projectId || !creatorProfileId) {
      return res.status(400).json({
        ok: false,
        error: 'projectId and creatorProfileId are required',
      });
    }

    // Verify user has permission
    const { data: teamMember, error: teamError } = await supabase
      .from('project_team_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('profile_id', profileId)
      .in('role', ['admin', 'moderator'])
      .single();

    if (teamError || !teamMember) {
      return res.status(403).json({
        ok: false,
        error: 'Not authorized to remove preferred creators for this project',
      });
    }

    // Remove from preferred list
    const { error: deleteError } = await supabase
      .from('project_preferred_creators')
      .delete()
      .eq('project_id', projectId)
      .eq('creator_profile_id', creatorProfileId);

    if (deleteError) {
      console.error('[Remove Preferred Creator API] Error removing creator:', deleteError);
      return res.status(500).json({ ok: false, error: 'Failed to remove preferred creator' });
    }

    return res.status(200).json({
      ok: true,
      message: 'Creator removed from preferred list',
    });
  } catch (error: any) {
    console.error('[Remove Preferred Creator API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
