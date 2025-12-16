/**
 * Cron API Route: ARC Scoring
 * 
 * Runs the ARC scoring job for all active arenas.
 * This fetches creator tweets, scores them based on content type, sentiment, and engagement,
 * and updates ARC points in arena_creators table.
 * 
 * Security: Requires CRON_SECRET via x-akari-cron-secret header (or allows dev mode).
 * 
 * Usage: GET or POST /api/cron/arc-score
 * Schedule: Can be configured in vercel.json (e.g., hourly or daily)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { runArcScoringJob } from '@/lib/arc/scoring';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Allow GET or POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const isDevMode = process.env.NODE_ENV === 'development';
    const cronSecret = process.env.CRON_SECRET;

    // In dev mode, allow without secret
    if (!isDevMode) {
      if (!cronSecret) {
        console.error('[CRON/arc-score] CRON_SECRET not configured');
        return res.status(500).json({
          ok: false,
          error: 'CRON_SECRET not configured',
        });
      }

      // Check x-akari-cron-secret header
      const providedSecret = req.headers['x-akari-cron-secret'] as string | undefined;

      if (!providedSecret || providedSecret !== cronSecret) {
        console.warn('[CRON/arc-score] Unauthorized - secret mismatch or missing');
        return res.status(401).json({
          ok: false,
          error: 'unauthorized',
        });
      }
    }

    console.log('[CRON/arc-score] Starting ARC scoring job...');

    const summary = await runArcScoringJob();

    console.log('[CRON/arc-score] ARC scoring job complete');

    return res.status(200).json({
      ok: true,
      ...summary,
    });
  } catch (error: any) {
    console.error('[CRON/arc-score] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}

