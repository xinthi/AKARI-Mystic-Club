/**
 * API Route: /api/portal/brands/campaigns/[campaignId]/utm
 *
 * GET: returns generated UTM links per campaign link for the current creator
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { resolveProfileId } from '@/lib/arc/resolveProfileId';

type Response =
  | { ok: true; links: Array<{ label: string | null; url: string; utmUrl: string; linkId: string; linkIndex: number | null }> }
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

  let profileId = user.profileId;
  if (!profileId) {
    profileId = await resolveProfileId(supabase, user.userId);
  }
  if (!profileId) {
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
    .select('id, label, url, display_order, link_index')
    .eq('campaign_id', campaignId)
    .order('display_order', { ascending: true });

  const linkRows = links || [];

  const { data: existing } = await supabase
    .from('campaign_utm_links')
    .select('id, utm_content, generated_url, brand_campaign_link_id')
    .eq('campaign_id', campaignId)
    .eq('creator_profile_id', profileId);

  const existingMap = (existing || []).reduce<Record<string, { url: string; id: string }>>((acc, row: any) => {
    const key = row.brand_campaign_link_id || row.utm_content;
    acc[String(key)] = { url: row.generated_url, id: row.id };
    return acc;
  }, {});

  const pendingMap = new Map<string, string>();
  const updateGeneratedUrls: Array<{ id: string; generated_url: string }> = [];

  const result = linkRows.map((link) => {
    const base = link.url;
    const existingEntry = existingMap[String(link.id)];
    let utmUrl = existingEntry?.url || '';
    if (!utmUrl && existingEntry?.id) {
      utmUrl = `/api/portal/utm/redirect?utmLinkId=${existingEntry.id}`;
      updateGeneratedUrls.push({ id: existingEntry.id, generated_url: utmUrl });
    }
    if (!utmUrl) {
      const utmLinkId = randomUUID();
      pendingMap.set(String(link.id), utmLinkId);
      utmUrl = `/api/portal/utm/redirect?utmLinkId=${utmLinkId}`;
    }
    return {
      label: link.label,
      url: base,
      utmUrl,
      linkId: link.id,
      linkIndex: link.link_index ?? null,
    };
  });

  const toInsert = linkRows
    .filter((link) => !existingMap[String(link.id)])
    .map((link) => {
      const utmLinkId = pendingMap.get(String(link.id)) || randomUUID();
      return {
        id: utmLinkId,
        campaign_id: campaignId,
        creator_profile_id: profileId,
        brand_campaign_link_id: link.id,
        base_url: link.url,
        utm_source: 'akari',
        utm_medium: 'creator',
        utm_campaign: campaignId,
        utm_content: link.id,
        generated_url: `/api/portal/utm/redirect?utmLinkId=${utmLinkId}`,
      };
    });

  if (toInsert.length > 0) {
    await supabase
      .from('campaign_utm_links')
      .upsert(toInsert, { onConflict: 'campaign_id,creator_profile_id,utm_content' });
  }

  if (updateGeneratedUrls.length > 0) {
    for (const row of updateGeneratedUrls) {
      await supabase
        .from('campaign_utm_links')
        .update({ generated_url: row.generated_url })
        .eq('id', row.id);
    }
  }

  return res.status(200).json({ ok: true, links: result });
}
