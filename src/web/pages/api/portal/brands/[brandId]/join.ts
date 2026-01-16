/**
 * API Route: /api/portal/brands/[brandId]/join
 *
 * POST: Join brand community
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | { ok: true }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const brandId = req.query.brandId as string | undefined;
  if (!brandId) {
    return res.status(400).json({ ok: false, error: 'brandId is required' });
  }

  if (!user.profileId) {
    return res.status(403).json({ ok: false, error: 'Profile not found' });
  }

  const { error } = await supabase
    .from('brand_members')
    .upsert({
      brand_id: brandId,
      profile_id: user.profileId,
    }, { onConflict: 'brand_id,profile_id' });

  if (error) {
    return res.status(500).json({ ok: false, error: 'Failed to join brand' });
  }

  return res.status(200).json({ ok: true });
}
