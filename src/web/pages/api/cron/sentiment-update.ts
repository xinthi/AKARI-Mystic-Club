/**
 * Cron API Route: Sentiment Update
 * 
 * Runs the sentiment update job for all active projects.
 * This fetches Twitter data from twitterapi.io, analyzes sentiment, and updates metrics.
 * 
 * Security: Requires CRON_SECRET via Authorization header (Vercel auto-adds this) or query param.
 * 
 * Usage: GET /api/cron/sentiment-update
 * Schedule: Daily at 06:00 UTC (configured in vercel.json)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { runSentimentUpdate } from '@/lib/cron/sentimentJob';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret) {
      console.error('[CRON/sentiment-update] CRON_SECRET not configured');
      return res.status(500).json({ ok: false, error: 'CRON_SECRET not configured' });
    }

    // Check Authorization header (Vercel sends "Bearer <CRON_SECRET>") or query param
    const authHeader = req.headers.authorization;
    const authSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const providedSecret = authSecret || (req.query.token as string | undefined);

    console.log(`[CRON/sentiment-update] Auth check: authHeader=${!!authHeader}, queryToken=${!!req.query.token}`);

    if (!providedSecret || providedSecret !== cronSecret) {
      console.warn('[CRON/sentiment-update] Unauthorized - secret mismatch or missing');
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
