/**
 * API Route: POST /api/portal/profile/ct-activity/sync
 * 
 * Triggers a sync of the current user's CT activity.
 * Fetches their last 200 tweets and matches them to tracked projects.
 * 
 * This is an authenticated endpoint - requires a valid session cookie.
 * 
 * IMPORTANT: This is separate from the Sentiment Terminal.
 * It does NOT modify:
 * - metrics_daily
 * - project_tweets
 * - inner_circle logic
 * - Any sentiment formulas
 * 
 * Response:
 *   {
 *     "ok": true,
 *     "processedTweets": 150,
 *     "matchedPairs": 18
 *   }
 * 
 * Error response:
 *   {
 *     "ok": false,
 *     "error": "Error message"
 *   }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { syncUserCtActivityFromLastTweets } from '../../../../../../server/userCtActivity';

// =============================================================================
// TYPES
// =============================================================================

type SyncResponse =
  | {
      ok: true;
      processedTweets: number;
      matchedPairs: number;
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================================
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SyncResponse>
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Get session token
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Validate session and get user ID
    const { data: session, error: sessionError } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from('akari_user_sessions')
        .delete()
        .eq('session_token', sessionToken);
      return res.status(401).json({ ok: false, error: 'Session expired' });
    }

    const userId = session.user_id;

    // Optional: Get max tweets from request body (default: 200)
    const maxTweets = typeof req.body?.maxTweets === 'number' 
      ? Math.min(Math.max(req.body.maxTweets, 50), 500) // Clamp to 50-500
      : 200;

    console.log(`[CT Activity Sync] Starting sync for user ${userId}, max tweets: ${maxTweets}`);

    // Call the sync service
    const result = await syncUserCtActivityFromLastTweets(userId, maxTweets);

    if (!result.ok) {
      console.error(`[CT Activity Sync] Sync failed for user ${userId}:`, result.error);
      return res.status(500).json({ ok: false, error: result.error || 'Sync failed' });
    }

    console.log(`[CT Activity Sync] Completed for user ${userId}: ${result.matchedPairs} matches`);

    return res.status(200).json({
      ok: true,
      processedTweets: result.processedTweets,
      matchedPairs: result.matchedPairs,
    });

  } catch (error: any) {
    console.error('[CT Activity Sync] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
