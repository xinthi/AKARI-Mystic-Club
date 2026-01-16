/**
 * API Route: /api/portal/brands/overview
 *
 * GET: Brand overview for CRM home (counts)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | { ok: true; brands: any[] }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const { data: brands, error } = await supabase
    .from('brand_profiles')
    .select('id, name, logo_url')
    .eq('owner_user_id', user.userId)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ ok: false, error: 'Failed to load brands' });
  }

  const brandIds = (brands || []).map((b: any) => b.id);

  const { data: memberRows } = await supabase
    .from('brand_members')
    .select('brand_id')
    .in('brand_id', brandIds.length ? brandIds : ['00000000-0000-0000-0000-000000000000']);

  const { data: campaignRows } = await supabase
    .from('brand_campaigns')
    .select('brand_id')
    .in('brand_id', brandIds.length ? brandIds : ['00000000-0000-0000-0000-000000000000']);

  const memberCountMap = (memberRows || []).reduce<Record<string, number>>((acc, row: any) => {
    acc[row.brand_id] = (acc[row.brand_id] || 0) + 1;
    return acc;
  }, {});

  const campaignCountMap = (campaignRows || []).reduce<Record<string, number>>((acc, row: any) => {
    acc[row.brand_id] = (acc[row.brand_id] || 0) + 1;
    return acc;
  }, {});

  const normalized = (brands || []).map((b: any) => ({
    ...b,
    membersCount: memberCountMap[b.id] || 0,
    questsCount: campaignCountMap[b.id] || 0,
  }));

  return res.status(200).json({ ok: true, brands: normalized });
}
