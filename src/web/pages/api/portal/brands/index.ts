/**
 * API Route: /api/portal/brands
 *
 * GET: List brands (owned by user)
 * POST: Create brand
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Brand = {
  id: string;
  name: string;
  x_handle: string | null;
  website: string | null;
  logo_url: string | null;
  brief_text: string | null;
};

type Response =
  | { ok: true; brands: Brand[] }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('brand_profiles')
      .select('id, name, x_handle, website, logo_url, brief_text')
      .eq('owner_user_id', user.userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ ok: false, error: 'Failed to load brands' });
    }

    return res.status(200).json({ ok: true, brands: data || [] });
  }

  if (req.method === 'POST') {
    const { name, xHandle, website, tgCommunity, tgChannel, briefText, logoUrl } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ ok: false, error: 'Brand name is required' });
    }

    const { data, error } = await supabase
      .from('brand_profiles')
      .insert({
        owner_user_id: user.userId,
        name: name.trim(),
        x_handle: xHandle ? String(xHandle).trim() : null,
        website: website ? String(website).trim() : null,
        tg_community: tgCommunity ? String(tgCommunity).trim() : null,
        tg_channel: tgChannel ? String(tgChannel).trim() : null,
        brief_text: briefText ? String(briefText).trim() : null,
        logo_url: logoUrl ? String(logoUrl).trim() : null,
      })
      .select('id, name, x_handle, website, logo_url, brief_text')
      .single();

    if (error || !data) {
      return res.status(500).json({ ok: false, error: 'Failed to create brand' });
    }

    return res.status(200).json({ ok: true, brands: [data] });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
