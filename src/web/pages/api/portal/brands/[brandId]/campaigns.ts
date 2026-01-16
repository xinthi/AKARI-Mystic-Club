/**
 * API Route: /api/portal/brands/[brandId]/campaigns
 *
 * GET: list campaigns for brand
 * POST: create campaign (owner only)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | { ok: true; campaigns: any[] }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const brandId = req.query.brandId as string | undefined;
  if (!brandId) {
    return res.status(400).json({ ok: false, error: 'brandId is required' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('brand_campaigns')
      .select('id, name, pitch, objectives, campaign_type, status, languages, created_at')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ ok: false, error: 'Failed to load campaigns' });
    }

    return res.status(200).json({ ok: true, campaigns: data || [] });
  }

  if (req.method === 'POST') {
    const { data: brand } = await supabase
      .from('brand_profiles')
      .select('owner_user_id')
      .eq('id', brandId)
      .maybeSingle();

    if (!brand || brand.owner_user_id !== user.userId) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const { name, pitch, objectives, campaignType, languages, links, startAt, endAt } = req.body || {};
    if (!name) {
      return res.status(400).json({ ok: false, error: 'Campaign name is required' });
    }

    const { data: campaign, error } = await supabase
      .from('brand_campaigns')
      .insert({
        brand_id: brandId,
        name: String(name).trim(),
        pitch: pitch ? String(pitch).trim() : null,
        objectives: objectives ? String(objectives).trim() : null,
        campaign_type: campaignType || 'public',
        languages: Array.isArray(languages) ? languages : null,
        start_at: startAt ? new Date(startAt).toISOString() : null,
        end_at: endAt ? new Date(endAt).toISOString() : null,
      })
      .select('id, name, pitch, objectives, campaign_type, status, languages, created_at')
      .single();

    if (error || !campaign) {
      return res.status(500).json({ ok: false, error: 'Failed to create campaign' });
    }

    if (Array.isArray(links) && links.length > 0) {
      const linkRows = links.slice(0, 6).map((link: any, index: number) => ({
        campaign_id: campaign.id,
        label: link.label ? String(link.label).trim() : null,
        url: String(link.url || '').trim(),
        display_order: index,
      })).filter((l: any) => l.url);
      if (linkRows.length > 0) {
        await supabase.from('brand_campaign_links').insert(linkRows);
      }
    }

    return res.status(200).json({ ok: true, campaigns: [campaign] });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
