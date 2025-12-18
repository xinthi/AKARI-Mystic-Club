/**
 * API Route: GET /api/portal/arc/leaderboard/[projectId]
 * 
 * Option 2: Normal Leaderboard (coming soon)
 * A normal leaderboard for a project where participation is open to creators on CT.
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
    error: 'Option 2 (Normal Leaderboard) is not yet implemented. Coming soon.',
  });
}


