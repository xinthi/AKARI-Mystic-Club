/**
 * API Route: /api/portal/brands/campaigns/[campaignId]/utm
 *
 * GET: returns generated UTM links per campaign link for the current creator
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | { ok: true; links: Array<{ label: string | null; url: string; utmUrl: string }> }
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

  if (!user.profileId) {
    return res.status(403).json({ ok: false, error: 'Profile not found' });
  }

  const { data: campaign } = await supabase
    .from('brand_campaigns')
    .select('id')
    .eq('id', campaignId)
    .maybeSingle();

  if (!campaign) {
    return res.status(404).json({ ok: false, error: 'Campaign not found' });
  }

  const { data: links } = await supabase
    .from('brand_campaign_links')
    .select('id, label, url, display_order')
    .eq('campaign_id', campaignId)
    .order('display_order', { ascending: true });

  const linkRows = links || [];

  const { data: existing } = await supabase
    .from('campaign_utm_links')
    .select('utm_content, generated_url')
    .eq('campaign_id', campaignId)
    .eq('creator_profile_id', user.profileId);

  const existingMap = (existing || []).reduce<Record<string, string>>((acc, row: any) => {
    acc[row.utm_content] = row.generated_url;
    return acc;
  }, {});

  const result = linkRows.map((link) => {
    const utmContent = link.id;
    const base = link.url;
    const utmUrl =
      existingMap[utmContent] ||
      `/api/portal/utm/redirect?campaignId=${campaignId}&creatorProfileId=${user.profileId}&linkId=${link.id}`;
    return {
      label: link.label,
      url: base,
      utmUrl,
    };
  });

  const toInsert = linkRows
    .filter((link) => !existingMap[link.id])
    .map((link) => ({
      campaign_id: campaignId,
      creator_profile_id: user.profileId,
      base_url: link.url,
      utm_source: 'akari',
      utm_medium: 'creator',
      utm_campaign: campaignId,
      utm_content: link.id,
      generated_url: `/api/portal/utm/redirect?campaignId=${campaignId}&creatorProfileId=${user.profileId}&linkId=${link.id}`,
    }));

  if (toInsert.length > 0) {
    await supabase.from('campaign_utm_links').upsert(toInsert, { onConflict: 'campaign_id,creator_profile_id,utm_content' });
  }

  return res.status(200).json({ ok: true, links: result });
}
