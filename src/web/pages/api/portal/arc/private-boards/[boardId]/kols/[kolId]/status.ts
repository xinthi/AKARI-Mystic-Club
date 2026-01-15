/**
 * API Route: /api/portal/arc/private-boards/[boardId]/kols/[kolId]/status
 *
 * PATCH: Update KOL status (admin only)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { checkProjectPermissions } from '@/lib/project-permissions';

type Response =
  | { ok: true }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const user = await requirePortalUser(req, res);
  if (!user) return;

  const boardId = req.query.boardId as string | undefined;
  const kolId = req.query.kolId as string | undefined;
  const { status } = req.body || {};

  if (!boardId || !kolId || !status) {
    return res.status(400).json({ ok: false, error: 'boardId, kolId, and status are required' });
  }

  if (!['invited', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'Invalid status' });
  }

  const supabase = getSupabaseAdmin();

  const { data: board } = await supabase
    .from('arc_private_boards')
    .select('project_id')
    .eq('id', boardId)
    .maybeSingle();

  if (!board?.project_id) {
    return res.status(404).json({ ok: false, error: 'Board not found' });
  }

  const permissions = await checkProjectPermissions(supabase, user.userId, board.project_id);
  const canManage = permissions.isOwner || permissions.isAdmin || permissions.isModerator;
  if (!canManage) {
    return res.status(403).json({ ok: false, error: 'Not authorized to manage this board' });
  }

  const { error } = await supabase
    .from('arc_private_board_kols')
    .update({ status })
    .eq('id', kolId)
    .eq('board_id', boardId);

  if (error) {
    return res.status(500).json({ ok: false, error: 'Failed to update status' });
  }

  return res.status(200).json({ ok: true });
}
