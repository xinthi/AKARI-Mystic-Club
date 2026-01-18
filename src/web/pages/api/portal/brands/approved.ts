/**
 * API Route: /api/portal/brands/approved
 *
 * GET: List approved brands (creator discovery)
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
    .select('id, name, x_handle, website, logo_url, brief_text, verification_status')
    .eq('verification_status', 'approved')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ ok: false, error: 'Failed to load brands' });
  }

  const handleSet = new Set<string>();
  const handleToImage: Record<string, string> = {};
  for (const brand of brands || []) {
    const handle = brand.x_handle?.replace('@', '').trim();
    if (!brand.logo_url && handle) {
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
      x_profile_image_url: !b.logo_url && handle ? handleToImage[handle] || null : null,
    };
  });

  return res.status(200).json({ ok: true, brands: normalized });
}
