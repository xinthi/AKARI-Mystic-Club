/**
 * API Route: /api/portal/brands/campaigns/[campaignId]/submit
 *
 * POST: Creator submits a post URL for a campaign
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

  const campaignId = req.query.campaignId as string | undefined;
  const { platform, postUrl } = req.body || {};

  if (!campaignId || !platform || !postUrl) {
    return res.status(400).json({ ok: false, error: 'campaignId, platform, and postUrl are required' });
  }

  if (!user.profileId) {
    return res.status(403).json({ ok: false, error: 'Profile not found' });
  }

  const { error } = await supabase
    .from('campaign_submissions')
    .insert({
      campaign_id: campaignId,
      creator_profile_id: user.profileId,
      platform: String(platform),
      post_url: String(postUrl),
      status: 'pending',
    });

  if (error) {
    return res.status(500).json({ ok: false, error: 'Failed to submit' });
  }

  return res.status(200).json({ ok: true });
}
