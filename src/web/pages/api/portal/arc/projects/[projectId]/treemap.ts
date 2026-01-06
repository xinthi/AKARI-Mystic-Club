/**
 * API Route: GET /api/portal/arc/projects/[projectId]/treemap
 * 
 * Returns treemap data for top 20 users from the leaderboard
 * Used for visualization of mindshare distribution
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { requirePortalUser } from '@/lib/server/require-portal-user';

interface TreemapNode {
  name: string;
  value: number; // Contribution percentage
  handle: string; // Twitter username
  avatar: string | null;
}

type TreemapResponse =
  | { ok: true; nodes: TreemapNode[] }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TreemapResponse>
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

    // Fetch leaderboard data (top 20)
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

    // Get top 20 entries
    const top20 = leaderboardData.entries.slice(0, 20);

    // Build treemap nodes
    const nodes: TreemapNode[] = top20.map((entry: any) => ({
      name: entry.twitter_username || 'Unknown',
      value: entry.contribution_pct || 0,
      handle: entry.twitter_username || '',
      avatar: entry.avatar_url || null,
    }));

    return res.status(200).json({
      ok: true,
      nodes,
    });
  } catch (error: any) {
    console.error('[ARC Treemap] Error:', error);
    return res.status(500).json({ ok: false, error: 'Unable to load treemap data' });
  }
}
