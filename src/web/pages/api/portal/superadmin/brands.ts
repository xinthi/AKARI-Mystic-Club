/**
 * API Route: /api/portal/superadmin/brands
 *
 * GET: List pending brand verifications
 * PATCH: Approve/reject brand verification
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/server/require-superadmin';

type Response =
  | { ok: true; brands: any[] }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  const auth = await requireSuperAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('brand_profiles')
      .select('id, name, x_handle, logo_url, owner_user_id, created_at, verification_status, verification_requested_at')
      .neq('verification_status', 'approved')
      .order('verification_requested_at', { ascending: true });

    if (error) {
      return res.status(500).json({ ok: false, error: 'Failed to load brand verifications' });
    }
    return res.status(200).json({ ok: true, brands: data || [] });
  }

  if (req.method === 'PATCH') {
    const { brandId, status } = req.body || {};
    if (!brandId || !status) {
      return res.status(400).json({ ok: false, error: 'brandId and status are required' });
    }
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'Invalid status' });
    }

    const updates: Record<string, any> = { verification_status: status };
    if (status === 'approved') {
      updates.verified_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('brand_profiles')
      .update(updates)
      .eq('id', brandId);

    if (error) {
      return res.status(500).json({ ok: false, error: 'Failed to update brand verification' });
    }

    return res.status(200).json({ ok: true, brands: [] });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
