/**
 * Cron API Route: Inner Circle Update
 * 
 * Runs the inner circle update job for all active projects.
 * This fetches followers from twitterapi.io, scores profiles, and builds inner circles.
 * 
 * Security: Requires CRON_SECRET via Authorization header (Vercel auto-adds this) or query param.
 * 
 * Usage: GET /api/cron/inner-circle-update
 * Schedule: Every Sunday at 08:00 UTC (configured in vercel.json)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { runInnerCircleUpdate } from '@/lib/cron/innerCircleJob';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret) {
      console.error('[CRON/inner-circle-update] CRON_SECRET not configured');
      return res.status(500).json({ ok: false, error: 'CRON_SECRET not configured' });
    }

    // Check Authorization header (Vercel sends "Bearer <CRON_SECRET>") or query param
    const authHeader = req.headers.authorization;
    const authSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const providedSecret = authSecret || (req.query.token as string | undefined);

    console.log(`[CRON/inner-circle-update] Auth check: authHeader=${!!authHeader}, queryToken=${!!req.query.token}`);

    if (!providedSecret || providedSecret !== cronSecret) {
      console.warn('[CRON/inner-circle-update] Unauthorized - secret mismatch or missing');
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    console.log('[CRON] Starting inner circle update...');

    const result = await runInnerCircleUpdate();

    console.log('[CRON] Inner circle update complete.');

    return res.status(200).json({
      ok: true,
      message: 'Inner circle update completed.',
      result,
    });
  } catch (error: any) {
    console.error('[CRON] Inner circle update failed:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
