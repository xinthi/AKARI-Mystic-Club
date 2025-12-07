/**
 * Cron API Route: Inner Circle Update
 * 
 * Runs the inner circle update job for all active projects.
 * This fetches followers from twitterapi.io, scores profiles, and builds inner circles.
 * 
 * Security: Requires CRON_SECRET in query param.
 * 
 * Usage: GET /api/cron/inner-circle-update?token=CRON_SECRET
 * Schedule: Every Sunday at 08:00 UTC (configured in vercel.json)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { runInnerCircleUpdate } from '@/lib/cron/innerCircleJob';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const token = req.query.token;

    // Protect with CRON_SECRET
    if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
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
