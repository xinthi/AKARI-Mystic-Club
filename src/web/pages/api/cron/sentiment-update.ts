/**
 * Cron API Route: Sentiment Update
 * 
 * Runs the sentiment update job for all active projects.
 * This fetches Twitter data from twitterapi.io, analyzes sentiment, and updates metrics.
 * 
 * Security: Requires CRON_SECRET in query param.
 * 
 * Usage: GET /api/cron/sentiment-update?token=CRON_SECRET
 * Schedule: Daily at 06:00 UTC (configured in vercel.json)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { runSentimentUpdate } from '@/lib/cron/sentimentJob';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const token = req.query.token;

    // Protect with CRON_SECRET
    if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    console.log('[CRON] Starting sentiment update...');

    const result = await runSentimentUpdate();

    console.log('[CRON] Sentiment update complete.');

    return res.status(200).json({
      ok: true,
      message: 'Sentiment update completed.',
      result,
    });
  } catch (error: any) {
    console.error('[CRON] Sentiment update failed:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
