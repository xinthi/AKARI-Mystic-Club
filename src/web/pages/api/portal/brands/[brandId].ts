/**
 * API Route: /api/portal/brands/[brandId]
 *
 * GET: Brand details + campaigns
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | { ok: true; brand: any; campaigns: any[]; isOwner: boolean }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const brandId = req.query.brandId as string | undefined;
  if (!brandId) {
    return res.status(400).json({ ok: false, error: 'brandId is required' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { data: brand, error: brandError } = await supabase
    .from('brand_profiles')
    .select('id, owner_user_id, name, x_handle, website, tg_community, tg_channel, brief_text, logo_url')
    .eq('id', brandId)
    .single();

  if (brandError || !brand) {
    return res.status(404).json({ ok: false, error: 'Brand not found' });
  }

  const { data: campaigns } = await supabase
    .from('brand_campaigns')
    .select('id, name, pitch, objectives, campaign_type, status, languages, created_at')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false });

  return res.status(200).json({
    ok: true,
    brand,
    campaigns: campaigns || [],
    isOwner: brand.owner_user_id === user.userId,
  });
}
