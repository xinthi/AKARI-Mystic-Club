/**
 * API Route: /api/portal/superadmin/refresh-x
 *
 * POST: Trigger global ARC X refresh (cron-style)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSuperAdmin } from '@/lib/server/require-superadmin';

type Response =
  | { ok: true; refreshed: number }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const auth = await requireSuperAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ ok: false, error: 'CRON_SECRET not configured' });
  }

  const host = req.headers.host ? `https://${req.headers.host}` : process.env.NEXT_PUBLIC_SITE_URL || '';
  const url = `${host}/api/portal/cron/arc-refresh-x?secret=${encodeURIComponent(secret)}`;
  const response = await fetch(url, { method: 'GET' });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    return res.status(500).json({ ok: false, error: data?.error || 'Failed to trigger refresh' });
  }

  return res.status(200).json({ ok: true, refreshed: Number(data.refreshed || 0) });
}
