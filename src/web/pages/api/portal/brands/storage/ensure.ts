/**
 * API Route: /api/portal/brands/storage/ensure
 *
 * POST/GET: Ensure brand-assets bucket exists
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response = { ok: true } | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const bucketName = 'brand-assets';
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) {
    return res.status(500).json({ ok: false, error: 'Failed to list buckets' });
  }

  if (!buckets || !buckets.some((b) => b.name === bucketName)) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      fileSizeLimit: 10485760,
    });
    if (createError) {
      return res.status(500).json({ ok: false, error: createError.message || 'Failed to create bucket' });
    }
  }

  return res.status(200).json({ ok: true });
}
