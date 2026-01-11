/**
 * API Route: POST /api/portal/crm/messages/send
 * 
 * Send a CRM message from a project to a creator
 * Optionally include a proposal
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type SendMessageResponse =
  | {
      ok: true;
      message: {
        id: string;
        project_id: string;
        creator_profile_id: string;
        subject: string;
        proposal_id?: string;
      };
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SendMessageResponse>
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
      subject,
      messageBody,
      messageType = 'promotional',
      proposalId, // Optional: link to existing proposal
    } = req.body;

    if (!projectId || !creatorProfileId || !subject || !messageBody) {
      return res.status(400).json({
        ok: false,
        error: 'projectId, creatorProfileId, subject, and messageBody are required',
      });
    }

    // Verify user has permission to send messages for this project
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
        error: 'Not authorized to send messages for this project',
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

    // Verify recipient is a creator (profile_type = 'personal' or NULL, not 'project')
    const { data: recipientProfile, error: recipientError } = await supabase
      .from('profiles')
      .select('id, profile_type')
      .eq('id', creatorProfileId)
      .single();

    if (recipientError || !recipientProfile) {
      return res.status(404).json({
        ok: false,
        error: 'Creator profile not found',
      });
    }

    // Only allow sending to creators (personal profiles), not to projects
    if (recipientProfile.profile_type === 'project') {
      return res.status(400).json({
        ok: false,
        error: 'Cannot send messages to project profiles. Only creator profiles are allowed.',
      });
    }

    // If proposalId is provided, verify it exists and belongs to this project/creator
    if (proposalId) {
      const { data: proposal, error: proposalError } = await supabase
        .from('crm_proposals')
        .select('id, project_id, creator_profile_id')
        .eq('id', proposalId)
        .single();

      if (proposalError || !proposal) {
        return res.status(404).json({
          ok: false,
          error: 'Proposal not found',
        });
      }

      if (proposal.project_id !== projectId || proposal.creator_profile_id !== creatorProfileId) {
        return res.status(400).json({
          ok: false,
          error: 'Proposal does not match project and creator',
        });
      }
    }

    // Create message
    const { data: message, error: messageError } = await supabase
      .from('crm_messages')
      .insert({
        project_id: projectId,
        creator_profile_id: creatorProfileId,
        subject,
        message_body: messageBody,
        message_type: messageType,
        has_proposal: !!proposalId,
        proposal_id: proposalId || null,
        sent_by_profile_id: profileId,
      })
      .select()
      .single();

    if (messageError) {
      console.error('[Send CRM Message API] Error creating message:', messageError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to send message',
      });
    }

    return res.status(200).json({
      ok: true,
      message: {
        id: message.id,
        project_id: message.project_id,
        creator_profile_id: message.creator_profile_id,
        subject: message.subject,
        ...(message.proposal_id && { proposal_id: message.proposal_id }),
      },
    });
  } catch (error: any) {
    console.error('[Send CRM Message API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
