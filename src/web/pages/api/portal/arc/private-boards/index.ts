/**
 * API Route: /api/portal/arc/private-boards
 *
 * GET: List private boards for a project (admin sees all, invited sees their boards)
 * POST: Create a new private board (admin only)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { checkProjectPermissions } from '@/lib/project-permissions';

type Board = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  base_url: string | null;
  status: 'active' | 'paused' | 'ended';
  visibility: 'private' | 'invite' | 'approved';
  created_at: string;
  kol_count?: number;
};

type Response =
  | { ok: true; boards: Board[]; canManage: boolean }
  | { ok: false; error: string };

async function getUserTwitterUsername(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<string | null> {
  let { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', userId)
    .in('provider', ['x', 'twitter'])
    .maybeSingle();

  if (!xIdentity?.username) {
    const { data: fallbackIdentity } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .not('username', 'is', null)
      .maybeSingle();
    xIdentity = fallbackIdentity || xIdentity;
  }

  return xIdentity?.username ? xIdentity.username.toLowerCase().replace('@', '').trim() : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    const user = await requirePortalUser(req, res);
    if (!user) return;

    const projectId = req.query.projectId as string | undefined;
    if (!projectId) {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    const permissions = await checkProjectPermissions(supabase, user.userId, projectId);
    const canManage = permissions.isOwner || permissions.isAdmin || permissions.isModerator;

    let boards: Board[] = [];

    if (canManage) {
      const { data: boardRows, error: boardError } = await supabase
        .from('arc_private_boards')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (boardError) {
        return res.status(500).json({ ok: false, error: 'Failed to load boards' });
      }

      const boardIds = (boardRows || []).map((b: any) => b.id);
      const { data: kols } = await supabase
        .from('arc_private_board_kols')
        .select('board_id')
        .in('board_id', boardIds.length > 0 ? boardIds : ['00000000-0000-0000-0000-000000000000']);

      const counts = (kols || []).reduce<Record<string, number>>((acc, row: any) => {
        acc[row.board_id] = (acc[row.board_id] || 0) + 1;
        return acc;
      }, {});

      boards = (boardRows || []).map((b: any) => ({
        ...b,
        kol_count: counts[b.id] || 0,
      }));
    } else {
      const twitterUsername = await getUserTwitterUsername(supabase, user.userId);
      const orFilters = [
        user.profileId ? `profile_id.eq.${user.profileId}` : null,
        twitterUsername ? `twitter_username.eq.${twitterUsername}` : null,
      ].filter(Boolean);

      if (orFilters.length === 0) {
        return res.status(200).json({ ok: true, boards: [], canManage: false });
      }

      const { data: kolRows, error: kolError } = await supabase
        .from('arc_private_board_kols')
        .select('board_id')
        .in('status', ['invited', 'approved'])
        .or(orFilters.join(','));
      if (kolError) {
        return res.status(500).json({ ok: false, error: 'Failed to load invites' });
      }

      const boardIds = Array.from(new Set((kolRows || []).map((k: any) => k.board_id)));
      if (boardIds.length === 0) {
        return res.status(200).json({ ok: true, boards: [], canManage: false });
      }

      const { data: boardRows } = await supabase
        .from('arc_private_boards')
        .select('*')
        .in('id', boardIds)
        .order('created_at', { ascending: false });

      boards = boardRows || [];
    }

    return res.status(200).json({ ok: true, boards, canManage });
  }

  if (req.method === 'POST') {
    const user = await requirePortalUser(req, res);
    if (!user) return;

    const { projectId, title, description, baseUrl, visibility } = req.body || {};
    if (!projectId || !title) {
      return res.status(400).json({ ok: false, error: 'projectId and title are required' });
    }

    const permissions = await checkProjectPermissions(supabase, user.userId, projectId);
    const canManage = permissions.isOwner || permissions.isAdmin || permissions.isModerator;
    if (!canManage) {
      return res.status(403).json({ ok: false, error: 'Not authorized to create boards for this project' });
    }

    const { data: board, error } = await supabase
      .from('arc_private_boards')
      .insert({
        project_id: projectId,
        title: String(title).trim(),
        description: description ? String(description).trim() : null,
        base_url: baseUrl ? String(baseUrl).trim() : null,
        visibility: visibility ?? 'private',
        created_by_profile_id: user.profileId,
      })
      .select('*')
      .single();

    if (error || !board) {
      return res.status(500).json({ ok: false, error: 'Failed to create board' });
    }

    return res.status(200).json({ ok: true, boards: [board], canManage: true });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
