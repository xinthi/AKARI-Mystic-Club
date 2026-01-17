/**
 * API Route: /api/portal/brands/campaigns/[campaignId]/join
 *
 * POST: Creator requests to join campaign
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { resolveProfileId } from '@/lib/arc/resolveProfileId';

type Response =
  | { ok: true; status: string }
  | { ok: false; error: string };

async function getUserTwitterUsername(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<string | null> {
  let { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', userId)
    .in('provider', ['x', 'twitter'])
    .maybeSingle();

  if (!xIdentity?.username) {
    const { data: fallbackIdentity } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .not('username', 'is', null)
      .maybeSingle();
    xIdentity = fallbackIdentity || xIdentity;
  }

  return xIdentity?.username ? xIdentity.username.toLowerCase().replace('@', '').trim() : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const campaignId = (req.query.campaignId ?? req.query.questId) as string | undefined;
  if (!campaignId) {
    return res.status(400).json({ ok: false, error: 'campaignId is required' });
  }

  const twitterUsername = await getUserTwitterUsername(supabase, user.userId);
  let profileId = user.profileId;
  if (!profileId) {
    profileId = await resolveProfileId(supabase, user.userId);
  }
  if (!profileId && !twitterUsername) {
    return res.status(403).json({ ok: false, error: 'Profile not found' });
  }

  const { data: campaign } = await supabase
    .from('brand_campaigns')
    .select('brand_id')
    .eq('id', campaignId)
    .maybeSingle();

  if (!campaign) {
    return res.status(404).json({ ok: false, error: 'Campaign not found' });
  }

  const { data: membership } = await supabase
    .from('brand_members')
    .select('id')
    .eq('brand_id', campaign.brand_id)
    .or(
      [
        profileId ? `profile_id.eq.${profileId}` : null,
        twitterUsername ? `username.eq.${twitterUsername}` : null,
      ]
        .filter(Boolean)
        .join(',')
    )
    .maybeSingle();

  if (!membership) {
    return res.status(400).json({ ok: false, error: 'Please join the brand community first' });
  }

  const { data: existing } = await supabase
    .from('brand_campaign_creators')
    .select('id, status')
    .eq('campaign_id', campaignId)
    .or(
      [
        profileId ? `profile_id.eq.${profileId}` : null,
        twitterUsername ? `username.eq.${twitterUsername}` : null,
      ]
        .filter(Boolean)
        .join(',')
    )
    .maybeSingle();

  if (existing) {
    return res.status(200).json({ ok: true, status: existing.status });
  }

  const { error } = await supabase
    .from('brand_campaign_creators')
    .insert({
      campaign_id: campaignId,
      profile_id: profileId,
      username: twitterUsername,
      status: 'pending',
    });

  if (error) {
    return res.status(500).json({ ok: false, error: 'Failed to join campaign' });
  }

  return res.status(200).json({ ok: true, status: 'pending' });
}
