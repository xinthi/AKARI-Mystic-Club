/**
 * API Route: POST /api/portal/crm/proposals/[proposalId]/counter
 * 
 * Counter a CRM proposal (creator counters with a new price)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type CounterProposalResponse =
  | {
      ok: true;
      proposal: {
        id: string;
        status: string;
        proposed_price_amount: number;
        proposed_price_currency: string;
      };
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CounterProposalResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { profileId } = await requirePortalUser(req, res);
    const supabase = createPortalClient();

    const { proposalId } = req.query;
    const { counterPriceAmount, counterPriceCurrency = 'USD' } = req.body;

    if (!proposalId || typeof proposalId !== 'string') {
      return res.status(400).json({ ok: false, error: 'proposalId is required' });
    }

    if (!counterPriceAmount || counterPriceAmount <= 0) {
      return res.status(400).json({
        ok: false,
        error: 'counterPriceAmount is required and must be positive',
      });
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

    if (proposal.status !== 'pending') {
      return res.status(400).json({
        ok: false,
        error: `Proposal is ${proposal.status}, cannot counter`,
      });
    }

    // Check if expired
    if (proposal.expires_at && new Date(proposal.expires_at) < new Date()) {
      // Update to expired
      await supabase
        .from('crm_proposals')
        .update({ status: 'expired' })
        .eq('id', proposalId);

      return res.status(400).json({ ok: false, error: 'Proposal has expired' });
    }

    // Counter proposal
    const { data: updatedProposal, error: updateError } = await supabase
      .from('crm_proposals')
      .update({
        status: 'countered',
        proposed_price_amount: counterPriceAmount,
        proposed_price_currency: counterPriceCurrency,
      })
      .eq('id', proposalId)
      .select()
      .single();

    if (updateError) {
      console.error('[Counter Proposal API] Error updating proposal:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to counter proposal' });
    }

    return res.status(200).json({
      ok: true,
      proposal: {
        id: updatedProposal.id,
        status: updatedProposal.status,
        proposed_price_amount: updatedProposal.proposed_price_amount!,
        proposed_price_currency: updatedProposal.proposed_price_currency!,
      },
    });
  } catch (error: any) {
    console.error('[Counter Proposal API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
