/**
 * Debug endpoint for Sports Football
 * 
 * Returns today's featured football matches from API-FOOTBALL.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getTodayFeaturedMatches } from '../../../services/sportsFootball';

type FootballMatchesResponse = {
  ok: boolean;
  matches: Awaited<ReturnType<typeof getTodayFeaturedMatches>>;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FootballMatchesResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      matches: [],
      error: 'Method not allowed',
    });
  }

  try {
    const matches = await getTodayFeaturedMatches(10);

    return res.status(200).json({
      ok: true,
      matches,
    });
  } catch (error: any) {
    console.error('[Debug: Football Matches] Error:', error);
    return res.status(500).json({
      ok: false,
      matches: [],
      error: error.message || 'Failed to fetch football matches',
    });
  }
}

