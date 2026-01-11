/**
 * API Route: POST /api/portal/crm/preferred-creators/add
 * 
 * Add a creator to project's preferred creators list
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type AddPreferredCreatorResponse =
  | {
      ok: true;
      preferredCreator: {
        id: string;
        project_id: string;
        creator_profile_id: string;
      };
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AddPreferredCreatorResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { profileId } = await requirePortalUser(req, res);
    const supabase = createPortalClient();

    const { projectId, creatorProfileId, listName, notes } = req.body;

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
        error: 'Not authorized to add preferred creators for this project',
      });
    }

    // Verify project has CRM enabled
    const { data: projectFeatures, error: featuresError } = await supabase
      .from('arc_project_features')
      .select('option1_crm_unlocked')
      .eq('project_id', projectId)
      .single();

    if (featuresError || !projectFeatures || !projectFeatures.option1_crm_unlocked) {
      return res.status(403).json({
        ok: false,
        error: 'CRM is not enabled for this project',
      });
    }

    // Check if already in list
    const { data: existing, error: checkError } = await supabase
      .from('project_preferred_creators')
      .select('id')
      .eq('project_id', projectId)
      .eq('creator_profile_id', creatorProfileId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 = not found, which is fine
      console.error('[Add Preferred Creator API] Error checking existing:', checkError);
      return res.status(500).json({ ok: false, error: 'Failed to check existing entry' });
    }

    if (existing) {
      return res.status(400).json({
        ok: false,
        error: 'Creator is already in preferred list',
      });
    }

    // Add to preferred list
    const { data: preferredCreator, error: insertError } = await supabase
      .from('project_preferred_creators')
      .insert({
        project_id: projectId,
        creator_profile_id: creatorProfileId,
        list_name: listName || null,
        notes: notes || null,
        added_by_profile_id: profileId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Add Preferred Creator API] Error adding creator:', insertError);
      return res.status(500).json({ ok: false, error: 'Failed to add preferred creator' });
    }

    return res.status(200).json({
      ok: true,
      preferredCreator: {
        id: preferredCreator.id,
        project_id: preferredCreator.project_id,
        creator_profile_id: preferredCreator.creator_profile_id,
      },
    });
  } catch (error: any) {
    console.error('[Add Preferred Creator API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
