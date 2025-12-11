/**
 * Cron Route: POST/GET /api/portal/cron/user-project-value-scores
 * 
 * Aggregates user CT activity into value scores per user→project pair.
 * This should be run periodically (e.g., every 6 hours or daily).
 * 
 * BEHAVIOR:
 * - By default, computes BOTH windows: 'last_200_tweets' and 'rolling_90_days'
 * - Pass ?window=<window> to compute only a specific window
 * - Pass ?allWindows=false to only compute the default window
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
 *     "scoresComputed": 240,
 *     "windows": ["last_200_tweets", "rolling_90_days"]
 *   }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { 
  computeValueScoresForAllUsers, 
  computeAllWindowsForAllUsers,
  SOURCE_WINDOW_LAST_200,
  SOURCE_WINDOW_ROLLING_90,
  VALID_SOURCE_WINDOWS,
  SourceWindow,
} from '../../../../../server/userCtActivity';

// =============================================================================
// TYPES
// =============================================================================

type CronResponse = {
  ok: boolean;
  usersProcessed: number;
  scoresComputed: number;
  windows?: string[];
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
    const limit = typeof req.query.limit === 'string'
      ? parseInt(req.query.limit, 10)
      : 100;
    
    // Check if a specific window is requested
    const specificWindow = typeof req.query.window === 'string' 
      ? req.query.window 
      : null;
    
    // Check if allWindows is explicitly disabled
    const allWindows = req.query.allWindows !== 'false';

    let result: { ok: boolean; usersProcessed: number; scoresComputed: number; error?: string };
    let windowsComputed: string[];

    if (specificWindow && VALID_SOURCE_WINDOWS.includes(specificWindow as SourceWindow)) {
      // Compute only the specified window
      console.log(`[user-project-value-scores] Computing single window: ${specificWindow}`);
      result = await computeValueScoresForAllUsers(specificWindow as SourceWindow, limit);
      windowsComputed = [specificWindow];
    } else if (allWindows) {
      // Compute BOTH windows (default behavior)
      console.log('[user-project-value-scores] Computing ALL windows');
      result = await computeAllWindowsForAllUsers(limit);
      windowsComputed = [SOURCE_WINDOW_LAST_200, SOURCE_WINDOW_ROLLING_90];
    } else {
      // Compute only default window
      console.log('[user-project-value-scores] Computing default window only');
      result = await computeValueScoresForAllUsers(SOURCE_WINDOW_LAST_200, limit);
      windowsComputed = [SOURCE_WINDOW_LAST_200];
    }

    if (!result.ok) {
      console.error('[user-project-value-scores] Computation failed:', result.error);
      return res.status(500).json({
        ok: false,
        usersProcessed: result.usersProcessed,
        scoresComputed: result.scoresComputed,
        windows: windowsComputed,
        error: result.error,
      });
    }

    console.log(`[user-project-value-scores] Completed: ${result.usersProcessed} users, ${result.scoresComputed} scores, windows: ${windowsComputed.join(', ')}`);

    return res.status(200).json({
      ok: true,
      usersProcessed: result.usersProcessed,
      scoresComputed: result.scoresComputed,
      windows: windowsComputed,
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
