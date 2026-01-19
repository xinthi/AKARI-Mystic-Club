/**
 * API Route: /api/portal/utm/redirect
 *
 * Logs UTM click and redirects to the final URL.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const campaignId = req.query.campaignId as string | undefined;
  const creatorProfileId = req.query.creatorProfileId as string | undefined;
  const linkId = req.query.linkId as string | undefined;
  const utmLinkId = req.query.utmLinkId as string | undefined;
  const platformParam = req.query.platform as string | undefined;
  const allowedPlatforms = new Set(['x', 'youtube', 'tiktok', 'telegram', 'linkedin', 'instagram', 'other']);
  const sourcePlatform =
    platformParam && allowedPlatforms.has(platformParam.toLowerCase()) ? platformParam.toLowerCase() : null;

  if (!utmLinkId && (!campaignId || !creatorProfileId || !linkId)) {
    return res.status(400).json({ ok: false, error: 'utmLinkId or campaignId, creatorProfileId, linkId are required' });
  }

  const supabase = getSupabaseAdmin();

  let resolvedCampaignId = campaignId;
  let resolvedCreatorId = creatorProfileId;
  let resolvedLinkId = linkId;
  let resolvedUrl: string | null = null;

  if (utmLinkId) {
    const { data: utmLink } = await supabase
      .from('campaign_utm_links')
      .select('campaign_id, creator_profile_id, brand_campaign_link_id, base_url')
      .eq('id', utmLinkId)
      .maybeSingle();
    resolvedCampaignId = utmLink?.campaign_id || resolvedCampaignId;
    resolvedCreatorId = utmLink?.creator_profile_id || resolvedCreatorId;
    resolvedLinkId = utmLink?.brand_campaign_link_id || resolvedLinkId;
    resolvedUrl = utmLink?.base_url || null;
  }

  if (!resolvedUrl && resolvedLinkId) {
    const { data: link } = await supabase
      .from('brand_campaign_links')
      .select('url')
      .eq('id', resolvedLinkId)
      .maybeSingle();
    resolvedUrl = link?.url || null;
  }

  if (!resolvedCampaignId || !resolvedCreatorId || !resolvedLinkId || !resolvedUrl) {
    return res.status(404).json({ ok: false, error: 'Link not found' });
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
  const ipHash = ip ? createHash('sha256').update(ip).digest('hex') : null;
  const country =
    (req.headers['x-vercel-ip-country'] as string | undefined) ||
    (req.headers['cf-ipcountry'] as string | undefined) ||
    null;

  if (ipHash) {
    const since = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('campaign_utm_events')
      .select('id')
      .eq('campaign_id', resolvedCampaignId)
      .eq('campaign_link_id', resolvedLinkId)
      .eq('ip_hash', ipHash)
      .gte('created_at', since)
      .limit(1);
    if (recent && recent.length > 0) {
      const url = new URL(resolvedUrl);
      url.searchParams.set('utm_source', 'akari');
      url.searchParams.set('utm_medium', 'creator');
      url.searchParams.set('utm_campaign', resolvedCampaignId);
      url.searchParams.set('utm_content', resolvedLinkId);
      return res.redirect(302, url.toString());
    }
  }

  await supabase.from('campaign_utm_events').insert({
    campaign_id: resolvedCampaignId,
    creator_profile_id: resolvedCreatorId,
    campaign_link_id: resolvedLinkId,
    event_type: 'click',
    referrer: req.headers.referer || null,
    user_agent: req.headers['user-agent'] || null,
    source_platform: sourcePlatform,
    location: null,
    ip_hash: ipHash,
    country,
    created_at: new Date().toISOString(),
  });

  const url = new URL(resolvedUrl);
  url.searchParams.set('utm_source', 'akari');
  url.searchParams.set('utm_medium', 'creator');
  url.searchParams.set('utm_campaign', resolvedCampaignId);
  url.searchParams.set('utm_content', resolvedLinkId);

  return res.redirect(302, url.toString());
}
