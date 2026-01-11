/**
 * API Route: POST /api/portal/crm/preferred-creators/bulk-message
 * 
 * Send bulk messages to preferred creators
 * This creates individual messages and optionally proposals for each creator
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type BulkMessageResponse =
  | {
      ok: true;
      results: {
        sent: number;
        failed: number;
        errors: string[];
      };
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BulkMessageResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { profileId } = await requirePortalUser(req, res);
    const supabase = createPortalClient();

    const {
      projectId,
      subject,
      messageBody,
      messageType = 'promotional',
      listName, // Optional: filter by list name
      includeProposal = false,
      proposalType = 'marketing',
      priceAmount,
      priceCurrency = 'USD',
      campaignId,
      expiresAt,
    } = req.body;

    if (!projectId || !subject || !messageBody) {
      return res.status(400).json({
        ok: false,
        error: 'projectId, subject, and messageBody are required',
      });
    }

    if (includeProposal && !priceAmount) {
      return res.status(400).json({
        ok: false,
        error: 'priceAmount is required when includeProposal is true',
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
        error: 'Not authorized to send bulk messages for this project',
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

    // Get preferred creators
    let query = supabase
      .from('project_preferred_creators')
      .select('creator_profile_id')
      .eq('project_id', projectId);

    if (listName && typeof listName === 'string') {
      query = query.eq('list_name', listName);
    }

    const { data: preferredCreators, error: preferredError } = await query;

    if (preferredError) {
      console.error('[Bulk Message API] Error fetching preferred creators:', preferredError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch preferred creators' });
    }

    if (!preferredCreators || preferredCreators.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'No preferred creators found',
      });
    }

    // Send messages to each creator
    const creatorIds = preferredCreators.map((pc) => pc.creator_profile_id);
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const creatorId of creatorIds) {
      try {
        let proposalId: string | null = null;

        // Create proposal if requested
        if (includeProposal) {
          const { data: proposal, error: proposalError } = await supabase
            .from('crm_proposals')
            .insert({
              project_id: projectId,
              creator_profile_id: creatorId,
              proposal_type: proposalType,
              initial_price_amount: priceAmount,
              initial_price_currency: priceCurrency,
              campaign_id: campaignId || null,
              expires_at: expiresAt || null,
              created_by_profile_id: profileId,
              status: 'pending',
            })
            .select('id')
            .single();

          if (proposalError || !proposal) {
            errors.push(`Failed to create proposal for creator ${creatorId}: ${proposalError?.message}`);
            failed++;
            continue;
          }

          proposalId = proposal.id;
        }

        // Create message
        const { error: messageError } = await supabase.from('crm_messages').insert({
          project_id: projectId,
          creator_profile_id: creatorId,
          subject,
          message_body: messageBody,
          message_type: messageType,
          has_proposal: includeProposal,
          proposal_id: proposalId,
          sent_by_profile_id: profileId,
        });

        if (messageError) {
          errors.push(`Failed to send message to creator ${creatorId}: ${messageError.message}`);
          failed++;
          // If proposal was created, we could optionally delete it here
          continue;
        }

        sent++;
      } catch (err: any) {
        errors.push(`Error processing creator ${creatorId}: ${err.message}`);
        failed++;
      }
    }

    return res.status(200).json({
      ok: true,
      results: {
        sent,
        failed,
        errors: errors.slice(0, 10), // Limit errors to first 10
      },
    });
  } catch (error: any) {
    console.error('[Bulk Message API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
