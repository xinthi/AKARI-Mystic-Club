import type { NextApiRequest, NextApiResponse } from 'next';

let getOverallLeaderboard: any = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tier } = req.query;
    const tierPattern = tier && tier !== 'all' ? (tier as string) : null;

    if (!getOverallLeaderboard) {
      const leaderboardModule = await import('../../../bot/src/utils/leaderboard.js');
      getOverallLeaderboard = leaderboardModule.getOverallLeaderboard;
    }

    const leaderboard = await getOverallLeaderboard(tierPattern);
    res.json({ leaderboard });
  } catch (error: any) {
    console.error('Leaderboard API error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
