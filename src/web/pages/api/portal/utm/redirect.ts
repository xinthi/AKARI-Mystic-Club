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

  if (!campaignId || !creatorProfileId || !linkId) {
    return res.status(400).json({ ok: false, error: 'campaignId, creatorProfileId, linkId are required' });
  }

  const supabase = getSupabaseAdmin();

  const { data: link } = await supabase
    .from('brand_campaign_links')
    .select('url')
    .eq('id', linkId)
    .maybeSingle();

  if (!link?.url) {
    return res.status(404).json({ ok: false, error: 'Link not found' });
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
  const ipHash = ip ? createHash('sha256').update(ip).digest('hex') : null;

  await supabase.from('campaign_utm_events').insert({
    campaign_id: campaignId,
    creator_profile_id: creatorProfileId,
    event_type: 'click',
    referrer: req.headers.referer || null,
    user_agent: req.headers['user-agent'] || null,
    source_platform: null,
    location: null,
    created_at: new Date().toISOString(),
  });

  const url = new URL(link.url);
  url.searchParams.set('utm_source', 'akari');
  url.searchParams.set('utm_medium', 'creator');
  url.searchParams.set('utm_campaign', campaignId);
  url.searchParams.set('utm_content', linkId);

  return res.redirect(302, url.toString());
}
