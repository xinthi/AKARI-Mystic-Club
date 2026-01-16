/**
 * API Route: /api/portal/brands/pending-requests
 *
 * GET: pending creator requests count for brand owners
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | { ok: true; count: number }
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
    .select('id')
    .eq('owner_user_id', user.userId);

  const brandIds = (brands || []).map((b: any) => b.id);
  if (brandIds.length === 0) {
    return res.status(200).json({ ok: true, count: 0 });
  }

  const { data: campaigns } = await supabase
    .from('brand_campaigns')
    .select('id')
    .in('brand_id', brandIds);

  const campaignIds = (campaigns || []).map((c: any) => c.id);
  if (campaignIds.length === 0) {
    return res.status(200).json({ ok: true, count: 0 });
  }

  const { count } = await supabase
    .from('brand_campaign_creators')
    .select('*', { count: 'exact', head: true })
    .in('campaign_id', campaignIds)
    .eq('status', 'pending');

  return res.status(200).json({ ok: true, count: count || 0 });
}
