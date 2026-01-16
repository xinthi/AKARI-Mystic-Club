/**
 * API Route: /api/portal/user/preferences
 *
 * GET: Return user preferences (arc_mode)
 * POST: Update user preferences
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | { ok: true; arcMode: 'creator' | 'crm' }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { data } = await supabase
      .from('portal_user_preferences')
      .select('arc_mode')
      .eq('user_id', user.userId)
      .maybeSingle();

    return res.status(200).json({
      ok: true,
      arcMode: (data?.arc_mode as 'creator' | 'crm') || 'creator',
    });
  }

  if (req.method === 'POST') {
    const arcMode = req.body?.arcMode as 'creator' | 'crm' | undefined;
    if (!arcMode || !['creator', 'crm'].includes(arcMode)) {
      return res.status(400).json({ ok: false, error: 'Invalid arcMode' });
    }

    const { error } = await supabase
      .from('portal_user_preferences')
      .upsert({
        user_id: user.userId,
        arc_mode: arcMode,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      return res.status(500).json({ ok: false, error: 'Failed to update preferences' });
    }

    return res.status(200).json({ ok: true, arcMode });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
