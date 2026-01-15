/**
 * API Route: /api/portal/arc/private-boards/track
 *
 * Logs UTM click and redirects to the final URL.
 * Query params: boardId, kolId
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const boardId = req.query.boardId as string | undefined;
  const kolId = req.query.kolId as string | undefined;
  const eventType = (req.query.event as string | undefined) === 'conversion' ? 'conversion' : 'click';

  if (!boardId || !kolId) {
    return res.status(400).json({ ok: false, error: 'boardId and kolId are required' });
  }

  const supabase = getSupabaseAdmin();

  const { data: utmRow, error } = await supabase
    .from('arc_private_board_utms')
    .select('base_url, utm_source, utm_medium, utm_campaign, utm_content')
    .eq('board_id', boardId)
    .eq('kol_id', kolId)
    .maybeSingle();

  if (error || !utmRow) {
    return res.status(404).json({ ok: false, error: 'UTM link not found' });
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
  const ipHash = ip ? createHash('sha256').update(ip).digest('hex') : null;

  await supabase.from('arc_private_board_utm_events').insert({
    board_id: boardId,
    kol_id: kolId,
    event_type: eventType,
    request_path: req.url || null,
    referrer: req.headers.referer || null,
    user_agent: req.headers['user-agent'] || null,
    ip_hash: ipHash,
  });

  if (eventType === 'conversion') {
    return res.status(200).json({ ok: true });
  }

  const url = new URL(utmRow.base_url);
  url.searchParams.set('utm_source', utmRow.utm_source);
  url.searchParams.set('utm_medium', utmRow.utm_medium);
  url.searchParams.set('utm_campaign', utmRow.utm_campaign);
  url.searchParams.set('utm_content', utmRow.utm_content);

  return res.redirect(302, url.toString());
}
