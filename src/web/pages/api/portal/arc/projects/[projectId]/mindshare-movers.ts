/**
 * API Route: GET /api/portal/arc/projects/[projectId]/mindshare-movers
 * 
 * Returns top gainers and losers with delta values
 * Query params: range (7d|1m|3m), mode (abs|rel)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { requirePortalUser } from '@/lib/server/require-portal-user';

interface MoverEntry {
  handle: string;
  name: string;
  current: number; // Current contribution percentage
  delta7d: number | null; // Delta in bps or %
  delta1m: number | null;
  delta3m: number | null;
  avatar: string | null;
}

type MoversResponse =
  | { ok: true; gainers: MoverEntry[]; losers: MoverEntry[] }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MoversResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const portalUser = await requirePortalUser(req, res);
    if (!portalUser) {
      return;
    }

    const supabase = getSupabaseAdmin();
    const { projectId } = req.query;
    const { range = '7d', mode = 'abs' } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    // Check ARC access
    const accessCheck = await requireArcAccess(supabase, projectId, 2);
    if (!accessCheck.ok) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error,
      });
    }

    // Fetch current leaderboard
    const leaderboardRes = await fetch(`${req.headers.origin || 'http://localhost:3000'}/api/portal/arc/leaderboard/${projectId}`, {
      headers: {
        cookie: req.headers.cookie || '',
      },
    });

    if (!leaderboardRes.ok) {
      return res.status(500).json({ ok: false, error: 'Failed to fetch leaderboard data' });
    }

    const leaderboardData = await leaderboardRes.json();
    if (!leaderboardData.ok || !leaderboardData.entries) {
      return res.status(500).json({ ok: false, error: 'Invalid leaderboard data' });
    }

    // For now, calculate deltas based on current data
    // TODO: Implement historical data comparison for real deltas
    const entries = leaderboardData.entries.map((entry: any) => ({
      handle: entry.twitter_username || '',
      name: entry.twitter_username || 'Unknown',
      current: entry.contribution_pct || 0,
      delta7d: entry.delta7d || null,
      delta1m: entry.delta1m || null,
      delta3m: entry.delta3m || null,
      avatar: entry.avatar_url || null,
    }));

    // Sort by current value for gainers (desc) and losers (asc)
    const gainers = [...entries]
      .sort((a, b) => b.current - a.current)
      .slice(0, 5);

    const losers = [...entries]
      .sort((a, b) => a.current - b.current)
      .slice(0, 5);

    return res.status(200).json({
      ok: true,
      gainers,
      losers,
    });
  } catch (error: any) {
    console.error('[ARC Mindshare Movers] Error:', error);
    return res.status(500).json({ ok: false, error: 'Unable to load movers data' });
  }
}
