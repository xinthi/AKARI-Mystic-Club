/**
 * API Route: GET /api/portal/arc/gamified/[projectId]
 * 
 * Option 3: Gamified Leaderboard (coming soon)
 * Extends Option 2 with quests (weekly sprints) inside the main leaderboard.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  return res.status(501).json({
    ok: false,
    error: 'Option 3 (Gamified Leaderboard) is not yet implemented. Coming soon.',
  });
}







