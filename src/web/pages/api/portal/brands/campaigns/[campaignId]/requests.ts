/**
 * API Route: /api/portal/brands/campaigns/[campaignId]/requests
 *
 * GET: list pending creators (owner only)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | { ok: true; requests: any[] }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const campaignId = (req.query.campaignId ?? req.query.questId) as string | undefined;
  if (!campaignId) {
    return res.status(400).json({ ok: false, error: 'campaignId is required' });
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

  const { data: requests, error } = await supabase
    .from('brand_campaign_creators')
    .select('id, username, status, joined_at, profile_id')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .order('joined_at', { ascending: true });

  if (error) {
    return res.status(500).json({ ok: false, error: 'Failed to load requests' });
  }

  return res.status(200).json({ ok: true, requests: requests || [] });
}
