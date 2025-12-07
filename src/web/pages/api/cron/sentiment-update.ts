/**
 * Cron API Route: Sentiment Update
 * 
 * Runs the sentiment update job for all active projects.
 * This fetches Twitter data, analyzes sentiment, and updates metrics.
 * 
 * Security: Requires CRON_SECRET in header, query param, or x-cron-token.
 * 
 * Usage: 
 *   GET /api/cron/sentiment-update?token=YOUR_CRON_SECRET
 *   or with header: Authorization: Bearer YOUR_CRON_SECRET
 *   or with header: x-cron-token: YOUR_CRON_SECRET
 * 
 * Schedule: Recommended to run every 4-6 hours via Vercel cron or external service.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { runSentimentUpdate } from '@/lib/cron/sentimentJob';

type SentimentUpdateResponse = {
  ok: boolean;
  startedAt?: string;
  finishedAt?: string;
  successCount?: number;
  failCount?: number;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SentimentUpdateResponse>
) {
  // Only allow GET requests (Vercel cron uses GET)
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  // Security: Check CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[Cron/SentimentUpdate] CRON_SECRET not set in environment');
    return res.status(500).json({
      ok: false,
      error: 'Cron secret not configured',
    });
  }

  // Check secret from multiple sources
  const providedSecret =
    req.headers.authorization?.replace('Bearer ', '') ||
    (req.headers['x-cron-token'] as string | undefined) ||
    (req.headers['x-cron-secret'] as string | undefined) ||
    (req.query.token as string | undefined) ||
    (req.query.secret as string | undefined);

  if (providedSecret !== cronSecret) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized',
    });
  }

  const startedAt = new Date().toISOString();
  console.log(`[Cron/SentimentUpdate] Starting at ${startedAt}`);

  try {
    const result = await runSentimentUpdate();
    
    const finishedAt = new Date().toISOString();
    console.log(`[Cron/SentimentUpdate] Finished at ${finishedAt}`);
    console.log(`[Cron/SentimentUpdate] Success: ${result.successCount}, Failed: ${result.failCount}`);

    return res.status(200).json({
      ok: true,
      startedAt,
      finishedAt,
      successCount: result.successCount,
      failCount: result.failCount,
    });
  } catch (error: any) {
    const finishedAt = new Date().toISOString();
    console.error(`[Cron/SentimentUpdate] Error at ${finishedAt}:`, error);

    return res.status(500).json({
      ok: false,
      startedAt,
      finishedAt,
      error: error.message || 'Internal error',
    });
  }
}

