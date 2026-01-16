/**
 * API Route: /api/portal/brands/campaigns/[campaignId]/status
 *
 * PATCH: update creator status (owner only)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | { ok: true }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const campaignId = (req.query.campaignId ?? req.query.questId) as string | undefined;
  const { creatorId, status } = req.body || {};

  if (!campaignId || !creatorId || !status) {
    return res.status(400).json({ ok: false, error: 'campaignId, creatorId, status are required' });
  }

  if (!['approved', 'rejected', 'invited', 'pending'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'Invalid status' });
  }

  const { data: campaign } = await supabase
    .from('brand_campaigns')
    .select('brand_id')
    .eq('id', campaignId)
    .maybeSingle();

  if (!campaign) {
    return res.status(404).json({ ok: false, error: 'Campaign not found' });
  }

  const { data: brand } = await supabase
    .from('brand_profiles')
    .select('owner_user_id')
    .eq('id', campaign.brand_id)
    .maybeSingle();

  if (!brand || brand.owner_user_id !== user.userId) {
    return res.status(403).json({ ok: false, error: 'Not authorized' });
  }

  const { error } = await supabase
    .from('brand_campaign_creators')
    .update({ status })
    .eq('id', creatorId)
    .eq('campaign_id', campaignId);

  if (error) {
    return res.status(500).json({ ok: false, error: 'Failed to update status' });
  }

  return res.status(200).json({ ok: true });
}
