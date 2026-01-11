/**
 * API Route: POST /api/portal/crm/proposals/create
 * 
 * Create a CRM proposal (deal offer) from a project to a creator
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type CreateProposalResponse =
  | {
      ok: true;
      proposal: {
        id: string;
        project_id: string;
        creator_profile_id: string;
        status: string;
      };
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateProposalResponse>
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

    const {
      projectId,
      creatorProfileId,
      proposalType = 'marketing',
      priceAmount,
      priceCurrency = 'USD',
      messageId, // Optional: link to a message
      campaignId, // Optional: link to a campaign
      expiresAt, // Optional: expiration date
      notes,
    } = req.body;

    if (!projectId || !creatorProfileId || !priceAmount) {
      return res.status(400).json({
        ok: false,
        error: 'projectId, creatorProfileId, and priceAmount are required',
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
        error: 'Not authorized to create proposals for this project',
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

    // Create proposal
    const { data: proposal, error: proposalError } = await supabase
      .from('crm_proposals')
      .insert({
        project_id: projectId,
        creator_profile_id: creatorProfileId,
        message_id: messageId || null,
        proposal_type: proposalType,
        initial_price_amount: priceAmount,
        initial_price_currency: priceCurrency,
        campaign_id: campaignId || null,
        expires_at: expiresAt || null,
        notes: notes || null,
        created_by_profile_id: profileId,
        status: 'pending',
      })
      .select()
      .single();

    if (proposalError) {
      console.error('[Create CRM Proposal API] Error creating proposal:', proposalError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to create proposal',
      });
    }

    return res.status(200).json({
      ok: true,
      proposal: {
        id: proposal.id,
        project_id: proposal.project_id,
        creator_profile_id: proposal.creator_profile_id,
        status: proposal.status,
      },
    });
  } catch (error: any) {
    console.error('[Create CRM Proposal API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
