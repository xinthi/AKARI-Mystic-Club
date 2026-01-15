/**
 * API Route: /api/portal/arc/private-boards/[boardId]/kols
 *
 * POST: Add KOLs to a private board (admin only)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { checkProjectPermissions } from '@/lib/project-permissions';

type Response =
  | { ok: true; added: number }
  | { ok: false; error: string };

function normalizeUsername(input: string): string {
  return input.toLowerCase().replace('@', '').trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const user = await requirePortalUser(req, res);
  if (!user) return;

  const boardId = req.query.boardId as string | undefined;
  const { usernames } = req.body || {};

  if (!boardId || !Array.isArray(usernames) || usernames.length === 0) {
    return res.status(400).json({ ok: false, error: 'boardId and usernames are required' });
  }

  const supabase = getSupabaseAdmin();

  const { data: board, error: boardError } = await supabase
    .from('arc_private_boards')
    .select('id, project_id, base_url')
    .eq('id', boardId)
    .single();

  if (boardError || !board) {
    return res.status(404).json({ ok: false, error: 'Board not found' });
  }

  const permissions = await checkProjectPermissions(supabase, user.userId, board.project_id);
  const canManage = permissions.isOwner || permissions.isAdmin || permissions.isModerator;
  if (!canManage) {
    return res.status(403).json({ ok: false, error: 'Not authorized to manage this board' });
  }

  if (!board.base_url) {
    return res.status(400).json({ ok: false, error: 'Board base_url is required to generate tracking links' });
  }

  const cleaned = usernames
    .map((u: string) => normalizeUsername(String(u)))
    .filter((u: string) => u.length > 0);

  if (cleaned.length === 0) {
    return res.status(400).json({ ok: false, error: 'No valid usernames provided' });
  }

  const profileRows = await supabase
    .from('profiles')
    .select('id, username')
    .in('username', cleaned);

  const profileMap = (profileRows.data || []).reduce<Record<string, string>>((acc, row: any) => {
    if (row.username) {
      acc[row.username.toLowerCase()] = row.id;
    }
    return acc;
  }, {});

  const insertRows = cleaned.map((username) => ({
    board_id: boardId,
    twitter_username: username,
    profile_id: profileMap[username] || null,
    status: 'invited',
  }));

  const { data: kols, error: insertError } = await supabase
    .from('arc_private_board_kols')
    .upsert(insertRows, { onConflict: 'board_id,twitter_username' })
    .select('id, twitter_username');

  if (insertError || !kols) {
    return res.status(500).json({ ok: false, error: 'Failed to add KOLs' });
  }

  const utmRows = kols.map((kol: any) => {
    const utmParams = {
      utm_source: 'arc_private',
      utm_medium: 'kol',
      utm_campaign: boardId,
      utm_content: kol.twitter_username,
    };
    const generatedUrl = `/api/portal/arc/private-boards/track?boardId=${boardId}&kolId=${kol.id}`;
    return {
      board_id: boardId,
      kol_id: kol.id,
      base_url: board.base_url,
      utm_source: utmParams.utm_source,
      utm_medium: utmParams.utm_medium,
      utm_campaign: utmParams.utm_campaign,
      utm_content: utmParams.utm_content,
      generated_url: generatedUrl,
    };
  });

  await supabase
    .from('arc_private_board_utms')
    .upsert(utmRows, { onConflict: 'kol_id' });

  return res.status(200).json({ ok: true, added: kols.length });
}
