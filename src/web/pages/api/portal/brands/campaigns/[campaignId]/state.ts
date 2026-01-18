/**
 * API Route: /api/portal/brands/campaigns/[campaignId]/state
 *
 * PATCH: Pause or end a quest (brand owner or superadmin)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { isSuperAdminServerSide } from '@/lib/server-auth';

type Response =
  | { ok: true }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const campaignId = (req.query.campaignId ?? req.query.questId) as string | undefined;
  const { status } = req.body || {};
  if (!campaignId || !status) {
    return res.status(400).json({ ok: false, error: 'campaignId and status are required' });
  }
  if (!['paused', 'ended', 'active'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'Invalid status' });
  }

  const { data: campaign } = await supabase
    .from('brand_campaigns')
    .select('id, brand_id')
    .eq('id', campaignId)
    .maybeSingle();

  if (!campaign) {
    return res.status(404).json({ ok: false, error: 'Quest not found' });
  }

  const { data: brand } = await supabase
    .from('brand_profiles')
    .select('owner_user_id')
    .eq('id', campaign.brand_id)
    .maybeSingle();

  const isOwner = brand?.owner_user_id === user.userId;
  const isSuperAdmin = await isSuperAdminServerSide(user.userId);

  if (!isOwner && !isSuperAdmin) {
    return res.status(403).json({ ok: false, error: 'Not authorized' });
  }

  const { error } = await supabase
    .from('brand_campaigns')
    .update({ status })
    .eq('id', campaignId);

  if (error) {
    return res.status(500).json({ ok: false, error: 'Failed to update quest status' });
  }

  return res.status(200).json({ ok: true });
}
