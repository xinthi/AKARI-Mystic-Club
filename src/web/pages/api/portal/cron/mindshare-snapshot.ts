/**
 * Cron Endpoint: Daily Mindshare Snapshot
 * 
 * GET /api/portal/cron/mindshare-snapshot?secret=CRON_SECRET
 * 
 * Scheduled job that computes mindshare snapshots for all windows.
 * Protected by CRON_SECRET.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';
import { computeAllMindshareSnapshots } from '../../../../../server/mindshare/snapshot';

// =============================================================================
// TYPES
// =============================================================================

type CronResponse =
  | {
      ok: true;
      message: string;
      results: Array<{
        window: string;
        asOfDate: string;
        totalProjects: number;
        snapshotsCreated: number;
        snapshotsUpdated: number;
        errors: number;
      }>;
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================================
// AUTHENTICATION
// =============================================================================

function validateCronSecret(req: NextApiRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn('[MindshareSnapshotCron] CRON_SECRET not configured in environment');
    return false;
  }

  // Extract authorization header - Vercel sends "Bearer <CRON_SECRET>"
  const authHeader = req.headers.authorization;
  const authSecret = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  const providedSecret =
    authSecret ||
    (req.headers['x-cron-secret'] as string | undefined) ||
    (req.query.secret as string | undefined) ||
    (req.query.token as string | undefined);

  if (!providedSecret) {
    console.warn('[MindshareSnapshotCron] No secret provided in request');
    return false;
  }

  const isValid = providedSecret === cronSecret;
  if (!isValid) {
    console.warn(
      `[MindshareSnapshotCron] Secret mismatch - provided length: ${providedSecret.length}, expected length: ${cronSecret.length}`
    );
  }

  return isValid;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CronResponse>
) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Validate CRON_SECRET
  if (!validateCronSecret(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const asOfDate = new Date();

    console.log(`[MindshareSnapshotCron] Starting computation for asOfDate=${asOfDate.toISOString().split('T')[0]}`);

    const results = await computeAllMindshareSnapshots(supabase, asOfDate);

    console.log(`[MindshareSnapshotCron] Completed: ${results.length} windows processed`);

    return res.status(200).json({
      ok: true,
      message: `Processed ${results.length} windows`,
      results: results.map(r => ({
        window: r.window,
        asOfDate: r.asOfDate,
        totalProjects: r.totalProjects,
        snapshotsCreated: r.snapshotsCreated,
        snapshotsUpdated: r.snapshotsUpdated,
        errors: r.errors.length,
      })),
    });
  } catch (error) {
    console.error('[MindshareSnapshotCron] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
