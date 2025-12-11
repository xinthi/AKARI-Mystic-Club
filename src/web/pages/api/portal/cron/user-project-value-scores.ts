/**
 * Cron Route: POST/GET /api/portal/cron/user-project-value-scores
 * 
 * Aggregates user CT activity into value scores per user→project pair.
 * This should be run periodically (e.g., every 6 hours or daily).
 * 
 * IMPORTANT: This is separate from the Sentiment Terminal.
 * It does NOT modify or use:
 * - metrics_daily
 * - project_tweets
 * - inner_circle logic
 * - Akari Score, Sentiment, CT Heat formulas
 * 
 * It only aggregates data from user_ct_activity table.
 * 
 * Protected with CRON_SECRET (query param, Authorization header, or x-cron-secret header).
 * 
 * Response:
 *   {
 *     "ok": true,
 *     "usersProcessed": 45,
 *     "scoresComputed": 120
 *   }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { computeValueScoresForAllUsers } from '../../../../../server/userCtActivity';

// =============================================================================
// TYPES
// =============================================================================

type CronResponse = {
  ok: boolean;
  usersProcessed: number;
  scoresComputed: number;
  error?: string;
};

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CronResponse>
) {
  // Only allow GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      usersProcessed: 0,
      scoresComputed: 0,
      error: 'Method not allowed',
    });
  }

  // Validate CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const providedSecret =
      req.headers.authorization?.replace('Bearer ', '') ||
      (req.headers['x-cron-secret'] as string | undefined) ||
      (req.query.secret as string | undefined);

    if (providedSecret !== cronSecret) {
      console.log('[user-project-value-scores] Unauthorized request');
      return res.status(401).json({
        ok: false,
        usersProcessed: 0,
        scoresComputed: 0,
        error: 'Unauthorized',
      });
    }
  }

  try {
    console.log('[user-project-value-scores] Starting value score computation...');

    // Get optional parameters from query
    const sourceWindow = typeof req.query.sourceWindow === 'string'
      ? req.query.sourceWindow
      : 'last_200_tweets';
    
    const limit = typeof req.query.limit === 'string'
      ? parseInt(req.query.limit, 10)
      : 100;

    // Compute value scores
    const result = await computeValueScoresForAllUsers(sourceWindow, limit);

    if (!result.ok) {
      console.error('[user-project-value-scores] Computation failed:', result.error);
      return res.status(500).json({
        ok: false,
        usersProcessed: result.usersProcessed,
        scoresComputed: result.scoresComputed,
        error: result.error,
      });
    }

    console.log(`[user-project-value-scores] Completed: ${result.usersProcessed} users, ${result.scoresComputed} scores`);

    return res.status(200).json({
      ok: true,
      usersProcessed: result.usersProcessed,
      scoresComputed: result.scoresComputed,
    });

  } catch (error: any) {
    console.error('[user-project-value-scores] Exception:', error?.message || error);
    return res.status(500).json({
      ok: false,
      usersProcessed: 0,
      scoresComputed: 0,
      error: `Exception: ${error?.message || 'Unknown error'}`,
    });
  }
}
