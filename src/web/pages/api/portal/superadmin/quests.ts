/**
 * API Route: /api/portal/superadmin/quests
 *
 * GET: List pending quest launch approvals
 * PATCH: Approve/reject quest launch
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/server/require-superadmin';

type Response =
  | { ok: true; quests: any[] }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  const auth = await requireSuperAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('brand_campaigns')
      .select(
        'id, name, brand_id, campaign_type, status, start_at, end_at, launch_status, launch_requested_at, brand_profiles (id, name, logo_url, x_handle)'
      )
      .neq('launch_status', 'approved')
      .order('launch_requested_at', { ascending: true });

    if (error) {
      return res.status(500).json({ ok: false, error: 'Failed to load quest approvals' });
    }

    const normalized = (data || []).map((q: any) => ({
      ...q,
      brand: Array.isArray(q.brand_profiles) ? q.brand_profiles[0] : q.brand_profiles,
    }));

    return res.status(200).json({ ok: true, quests: normalized });
  }

  if (req.method === 'PATCH') {
    const { questId, status } = req.body || {};
    if (!questId || !status) {
      return res.status(400).json({ ok: false, error: 'questId and status are required' });
    }
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'Invalid status' });
    }

    const updates: Record<string, any> = { launch_status: status };
    if (status === 'approved') {
      updates.launch_approved_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('brand_campaigns')
      .update(updates)
      .eq('id', questId);

    if (error) {
      return res.status(500).json({ ok: false, error: 'Failed to update quest launch status' });
    }

    return res.status(200).json({ ok: true, quests: [] });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
