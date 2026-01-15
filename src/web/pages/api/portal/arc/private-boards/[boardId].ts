/**
 * API Route: /api/portal/arc/private-boards/[boardId]
 *
 * GET: Board details. Project team can see all KOLs; invited KOLs can see their entry.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { checkProjectPermissions } from '@/lib/project-permissions';

type BoardResponse =
  | {
      ok: true;
      board: any;
      kols: any[];
      canManage: boolean;
      viewer: { profileId: string | null; twitterUsername: string | null };
    }
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

export default async function handler(req: NextApiRequest, res: NextApiResponse<BoardResponse>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const user = await requirePortalUser(req, res);
  if (!user) return;

  const boardId = req.query.boardId as string | undefined;
  if (!boardId) {
    return res.status(400).json({ ok: false, error: 'boardId is required' });
  }

  const supabase = getSupabaseAdmin();

  const { data: board, error: boardError } = await supabase
    .from('arc_private_boards')
    .select('*')
    .eq('id', boardId)
    .single();

  if (boardError || !board) {
    return res.status(404).json({ ok: false, error: 'Board not found' });
  }

  const permissions = await checkProjectPermissions(supabase, user.userId, board.project_id);
  const canManage = permissions.isOwner || permissions.isAdmin || permissions.isModerator;

  const twitterUsername = await getUserTwitterUsername(supabase, user.userId);

  let kols: any[] = [];

  if (canManage) {
    const { data: kolRows } = await supabase
      .from('arc_private_board_kols')
      .select('id, profile_id, twitter_username, status, created_at')
      .eq('board_id', boardId)
      .order('created_at', { ascending: false });

    const { data: utms } = await supabase
      .from('arc_private_board_utms')
      .select('kol_id, generated_url')
      .eq('board_id', boardId);

    const { data: events } = await supabase
      .from('arc_private_board_utm_events')
      .select('kol_id, event_type')
      .eq('board_id', boardId);

    const utmMap = (utms || []).reduce<Record<string, string>>((acc, row: any) => {
      acc[row.kol_id] = row.generated_url;
      return acc;
    }, {});

    const eventCounts = (events || []).reduce<Record<string, { clicks: number; conversions: number }>>(
      (acc, row: any) => {
        if (!row.kol_id) return acc;
        if (!acc[row.kol_id]) acc[row.kol_id] = { clicks: 0, conversions: 0 };
        if (row.event_type === 'click') acc[row.kol_id].clicks += 1;
        if (row.event_type === 'conversion') acc[row.kol_id].conversions += 1;
        return acc;
      },
      {}
    );

    kols = (kolRows || []).map((k: any) => ({
      ...k,
      utm_url: utmMap[k.id] || null,
      clicks: eventCounts[k.id]?.clicks || 0,
      conversions: eventCounts[k.id]?.conversions || 0,
    }));
  } else {
    const orFilters = [
      user.profileId ? `profile_id.eq.${user.profileId}` : null,
      twitterUsername ? `twitter_username.eq.${twitterUsername}` : null,
    ].filter(Boolean);

    if (orFilters.length === 0) {
      return res.status(403).json({ ok: false, error: 'Not authorized to view this board' });
    }

    const { data: kolRow } = await supabase
      .from('arc_private_board_kols')
      .select('id, profile_id, twitter_username, status, created_at')
      .eq('board_id', boardId)
      .or(orFilters.join(','))
      .maybeSingle();

    if (!kolRow) {
      return res.status(403).json({ ok: false, error: 'Not authorized to view this board' });
    }

    const { data: utm } = await supabase
      .from('arc_private_board_utms')
      .select('generated_url')
      .eq('kol_id', kolRow.id)
      .maybeSingle();

    kols = [
      {
        ...kolRow,
        utm_url: utm?.generated_url || null,
      },
    ];
  }

  return res.status(200).json({
    ok: true,
    board,
    kols,
    canManage,
    viewer: {
      profileId: user.profileId,
      twitterUsername,
    },
  });
}
