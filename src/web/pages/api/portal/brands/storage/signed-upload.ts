/**
 * API Route: /api/portal/brands/storage/signed-upload
 *
 * POST: Create signed upload URL for brand assets
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | { ok: true; signedUrl: string; publicUrl: string }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const { path } = req.body || {};
  if (!path || typeof path !== 'string') {
    return res.status(400).json({ ok: false, error: 'path is required' });
  }

  const bucketName = 'brand-assets';
  const { data: signed, error } = await supabase.storage.from(bucketName).createSignedUploadUrl(path);
  if (error || !signed?.signedUrl) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to create signed upload URL' });
  }

  const { data: publicData } = supabase.storage.from(bucketName).getPublicUrl(path);
  return res.status(200).json({ ok: true, signedUrl: signed.signedUrl, publicUrl: publicData.publicUrl });
}
