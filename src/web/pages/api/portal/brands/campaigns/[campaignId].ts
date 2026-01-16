/**
 * API Route: /api/portal/brands/campaigns/[campaignId]
 *
 * GET: Campaign detail for creator + owner
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | {
      ok: true;
      campaign: any;
      brand: any;
      links: any[];
      creatorStatus: string | null;
      isMember: boolean;
      isOwner: boolean;
      submissions: any[];
    }
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
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const campaignId = req.query.campaignId as string | undefined;
  if (!campaignId) {
    return res.status(400).json({ ok: false, error: 'campaignId is required' });
  }

  const { data: campaign } = await supabase
    .from('brand_campaigns')
    .select('id, brand_id, name, pitch, objectives, campaign_type, status, languages, start_at, end_at')
    .eq('id', campaignId)
    .maybeSingle();

  if (!campaign) {
    return res.status(404).json({ ok: false, error: 'Campaign not found' });
  }

  const { data: brand } = await supabase
    .from('brand_profiles')
    .select('id, owner_user_id, name, x_handle, website, tg_community, tg_channel, brief_text, logo_url')
    .eq('id', campaign.brand_id)
    .maybeSingle();

  if (!brand) {
    return res.status(404).json({ ok: false, error: 'Brand not found' });
  }

  const { data: links } = await supabase
    .from('brand_campaign_links')
    .select('id, label, url, display_order')
    .eq('campaign_id', campaignId)
    .order('display_order', { ascending: true });

  const twitterUsername = await getUserTwitterUsername(supabase, user.userId);

  const { data: creatorRow } = await supabase
    .from('brand_campaign_creators')
    .select('status')
    .eq('campaign_id', campaignId)
    .or(
      [
        user.profileId ? `profile_id.eq.${user.profileId}` : null,
        twitterUsername ? `username.eq.${twitterUsername}` : null,
      ]
        .filter(Boolean)
        .join(',')
    )
    .maybeSingle();

  const { data: memberRow } = await supabase
    .from('brand_members')
    .select('id')
    .eq('brand_id', brand.id)
    .or(
      [
        user.profileId ? `profile_id.eq.${user.profileId}` : null,
        twitterUsername ? `username.eq.${twitterUsername}` : null,
      ]
        .filter(Boolean)
        .join(',')
    )
    .maybeSingle();

  const { data: submissions } = await supabase
    .from('campaign_submissions')
    .select('id, platform, post_url, status, submitted_at, like_count, reply_count, repost_count, view_count')
    .eq('campaign_id', campaignId)
    .eq('creator_profile_id', user.profileId || '00000000-0000-0000-0000-000000000000')
    .order('submitted_at', { ascending: false });

  return res.status(200).json({
    ok: true,
    campaign,
    brand,
    links: links || [],
    creatorStatus: creatorRow?.status || null,
    isMember: !!memberRow,
    isOwner: brand.owner_user_id === user.userId,
    submissions: submissions || [],
  });
}
