/**
 * API Route: /api/portal/brands/requests
 *
 * GET: Pending quest join requests for brand owners
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | { ok: true; requests: any[] }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const { data: brands } = await supabase
    .from('brand_profiles')
    .select('id, name')
    .eq('owner_user_id', user.userId);

  const brandIds = (brands || []).map((b: any) => b.id);
  if (brandIds.length === 0) {
    return res.status(200).json({ ok: true, requests: [] });
  }

  const { data: campaigns } = await supabase
    .from('brand_campaigns')
    .select('id, name, brand_id')
    .in('brand_id', brandIds);

  const campaignIds = (campaigns || []).map((c: any) => c.id);
  if (campaignIds.length === 0) {
    return res.status(200).json({ ok: true, requests: [] });
  }

  const { data: pending } = await supabase
    .from('brand_campaign_creators')
    .select('id, username, status, joined_at, campaign_id')
    .in('campaign_id', campaignIds)
    .eq('status', 'pending')
    .order('joined_at', { ascending: true });

  const brandMap = (brands || []).reduce<Record<string, string>>((acc, b: any) => {
    acc[b.id] = b.name;
    return acc;
  }, {});

  const campaignMap = (campaigns || []).reduce<Record<string, { name: string; brand_id: string }>>((acc, c: any) => {
    acc[c.id] = { name: c.name, brand_id: c.brand_id };
    return acc;
  }, {});

  const normalized = (pending || []).map((row: any) => {
    const campaign = campaignMap[row.campaign_id];
    return {
      id: row.id,
      username: row.username,
      joined_at: row.joined_at,
      campaign_id: row.campaign_id,
      quest_name: campaign?.name || 'Quest',
      brand_name: campaign ? brandMap[campaign.brand_id] : 'Brand',
    };
  });

  return res.status(200).json({ ok: true, requests: normalized });
}
