/**
 * API Route: /api/portal/brands/overview
 *
 * GET: Brand overview for CRM home (counts)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { taioGetUserInfo } from '@/server/twitterapiio';

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
    .select('id, name, logo_url, x_handle')
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

  const handleSet = new Set<string>();
  const handleToImage: Record<string, string> = {};
  for (const brand of brands || []) {
    const handle = brand.x_handle?.replace('@', '').trim();
    if (!brand.logo_url && handle && !handleSet.has(handle)) {
      handleSet.add(handle);
    }
  }

  const handles = Array.from(handleSet).slice(0, 15);
  for (const handle of handles) {
    const userInfo = await taioGetUserInfo(handle);
    if (userInfo?.profileImageUrl) {
      handleToImage[handle] = userInfo.profileImageUrl;
    }
  }

  const normalized = (brands || []).map((b: any) => {
    const handle = b.x_handle?.replace('@', '').trim();
    return {
      ...b,
      membersCount: memberCountMap[b.id] || 0,
      questsCount: campaignCountMap[b.id] || 0,
      x_profile_image_url: !b.logo_url && handle ? handleToImage[handle] || null : null,
    };
  });

  return res.status(200).json({ ok: true, brands: normalized });
}
