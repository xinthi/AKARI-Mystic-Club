/**
 * API Route: /api/portal/brands/campaigns/[campaignId]/invite
 *
 * POST: invite creator/KOL by username (owner only)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | { ok: true }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const campaignId = (req.query.campaignId ?? req.query.questId) as string | undefined;
  const { username } = req.body || {};

  if (!campaignId || !username) {
    return res.status(400).json({ ok: false, error: 'campaignId and username are required' });
  }

  const cleanUsername = String(username).replace(/^@+/, '').trim().toLowerCase();
  if (!cleanUsername) {
    return res.status(400).json({ ok: false, error: 'username is required' });
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', cleanUsername)
    .maybeSingle();

  const { error } = await supabase
    .from('brand_campaign_creators')
    .upsert(
      {
        campaign_id: campaignId,
        profile_id: profile?.id || null,
        username: cleanUsername,
        status: 'invited',
        joined_at: new Date().toISOString(),
      },
      { onConflict: 'campaign_id,username' }
    );

  if (error) {
    return res.status(500).json({ ok: false, error: 'Failed to invite creator' });
  }

  return res.status(200).json({ ok: true });
}
