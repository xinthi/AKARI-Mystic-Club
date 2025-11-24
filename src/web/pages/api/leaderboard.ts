import type { NextApiRequest, NextApiResponse } from 'next';
import { getOverallLeaderboard as getLeaderboardFn } from '../../lib/bot-utils';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tier } = req.query;
    const tierPattern = tier && tier !== 'all' ? (tier as string) : null;

    // @ts-ignore - Bot function signature
    const leaderboard = await getLeaderboardFn(tierPattern);
    res.json({ leaderboard });
  } catch (error: any) {
    console.error('Leaderboard API error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
