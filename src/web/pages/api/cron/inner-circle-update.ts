/**
 * Cron API Route: Inner Circle Update
 * 
 * Runs the inner circle update job for all active projects.
 * This fetches followers, scores profiles, and builds inner circles.
 * 
 * Security: Requires CRON_SECRET in header, query param, or x-cron-token.
 * 
 * Usage: 
 *   GET /api/cron/inner-circle-update?token=YOUR_CRON_SECRET
 *   or with header: Authorization: Bearer YOUR_CRON_SECRET
 *   or with header: x-cron-token: YOUR_CRON_SECRET
 * 
 * Schedule: Recommended to run daily, after sentiment-update.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { runInnerCircleUpdate } from '@/lib/cron/innerCircleJob';

type InnerCircleUpdateResponse = {
  ok: boolean;
  startedAt?: string;
  finishedAt?: string;
  projectsProcessed?: number;
  followersPulled?: number;
  profilesUpserted?: number;
  innerCircleMembers?: number;
  totalPower?: number;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<InnerCircleUpdateResponse>
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
    console.error('[Cron/InnerCircleUpdate] CRON_SECRET not set in environment');
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
  console.log(`[Cron/InnerCircleUpdate] Starting at ${startedAt}`);

  try {
    const result = await runInnerCircleUpdate();
    
    const finishedAt = new Date().toISOString();
    console.log(`[Cron/InnerCircleUpdate] Finished at ${finishedAt}`);
    console.log(`[Cron/InnerCircleUpdate] Projects: ${result.projectsProcessed}, Inner Circle Members: ${result.innerCircleMembers}`);

    return res.status(200).json({
      ok: true,
      startedAt,
      finishedAt,
      projectsProcessed: result.projectsProcessed,
      followersPulled: result.followersPulled,
      profilesUpserted: result.profilesUpserted,
      innerCircleMembers: result.innerCircleMembers,
      totalPower: result.totalPower,
    });
  } catch (error: any) {
    const finishedAt = new Date().toISOString();
    console.error(`[Cron/InnerCircleUpdate] Error at ${finishedAt}:`, error);

    return res.status(500).json({
      ok: false,
      startedAt,
      finishedAt,
      error: error.message || 'Internal error',
    });
  }
}

