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
    if (!startAt || !endAt) {
      return res.status(400).json({ ok: false, error: 'Start and end dates are required' });
    }
    const startMs = new Date(startAt).getTime();
    const endMs = new Date(endAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return res.status(400).json({ ok: false, error: 'Invalid campaign dates' });
    }
    const minDurationMs = 7 * 24 * 60 * 60 * 1000;
    if (endMs - startMs < minDurationMs) {
      return res.status(400).json({ ok: false, error: 'Quest must run for at least 7 days' });
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
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        launch_status: 'pending',
        launch_requested_at: new Date().toISOString(),
      })
      .select('id, name, pitch, objectives, campaign_type, status, languages, created_at')
      .single();

    if (error || !campaign) {
      return res.status(500).json({ ok: false, error: 'Failed to create campaign' });
    }

    if (Array.isArray(links) && links.length > 0) {
      const limitedLinks = links.slice(0, 5);
      const linkRows = limitedLinks
        .map((link: any, index: number) => {
          const rawIndex = link.linkIndex ?? link.link_index ?? link.index;
          const linkIndex = Number.isFinite(Number(rawIndex)) ? Number(rawIndex) : index + 1;
          return {
            campaign_id: campaign.id,
            label: link.label ? String(link.label).trim() : null,
            url: String(link.url || '').trim(),
            display_order: index,
            link_index: linkIndex,
          };
        })
        .filter((l: any) => l.url);

      const seenIndexes = new Set<number>();
      for (const row of linkRows) {
        if (!Number.isInteger(row.link_index) || row.link_index < 1 || row.link_index > 5) {
          return res.status(400).json({ ok: false, error: 'link_index must be between 1 and 5' });
        }
        if (seenIndexes.has(row.link_index)) {
          return res.status(400).json({ ok: false, error: 'link_index must be unique per campaign' });
        }
        seenIndexes.add(row.link_index);
      }

      if (linkRows.length > 0) {
        await supabase.from('brand_campaign_links').insert(linkRows);
      }
    }

    return res.status(200).json({ ok: true, campaigns: [campaign] });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
