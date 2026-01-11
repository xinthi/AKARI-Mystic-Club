/**
 * API Route: POST /api/portal/crm/proposals/[proposalId]/reject
 * 
 * Reject a CRM proposal (creator rejects the deal)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type RejectProposalResponse =
  | {
      ok: true;
      proposal: {
        id: string;
        status: string;
      };
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RejectProposalResponse>
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

    const { proposalId } = req.query;

    if (!proposalId || typeof proposalId !== 'string') {
      return res.status(400).json({ ok: false, error: 'proposalId is required' });
    }

    // Get proposal
    const { data: proposal, error: proposalError } = await supabase
      .from('crm_proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (proposalError || !proposal) {
      return res.status(404).json({ ok: false, error: 'Proposal not found' });
    }

    // Verify current user is the creator
    if (proposal.creator_profile_id !== profileId) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    if (proposal.status === 'accepted' || proposal.status === 'rejected') {
      return res.status(400).json({
        ok: false,
        error: `Proposal is already ${proposal.status}`,
      });
    }

    // Reject proposal
    const { data: updatedProposal, error: updateError } = await supabase
      .from('crm_proposals')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
      })
      .eq('id', proposalId)
      .select()
      .single();

    if (updateError) {
      console.error('[Reject Proposal API] Error updating proposal:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to reject proposal' });
    }

    return res.status(200).json({
      ok: true,
      proposal: {
        id: updatedProposal.id,
        status: updatedProposal.status,
      },
    });
  } catch (error: any) {
    console.error('[Reject Proposal API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
