/**
 * API Route: GET /api/portal/profile/[userId]/top-projects
 * 
 * Returns the top 5 projects a user has amplified based on their value scores.
 * 
 * IMPORTANT: This is separate from the Sentiment Terminal.
 * It queries user_project_value_scores (based on user's last 200 tweets),
 * NOT the sentiment data (metrics_daily, project_tweets, etc.).
 * 
 * [userId] can be:
 *   - "me" → current logged-in user
 *   - explicit UUID → if current user has permission to view that profile
 * 
 * This is an authenticated endpoint - requires a valid session cookie.
 * 
 * Response:
 *   {
 *     "ok": true,
 *     "userId": "...",
 *     "sourceWindow": "last_200_tweets",
 *     "projects": [
 *       {
 *         "projectId": "...",
 *         "slug": "binance",
 *         "name": "Binance",
 *         "avatarUrl": "...",
 *         "tweetCount": 12,
 *         "totalEngagement": 540,
 *         "valueScore": 1234,
 *         "lastTweetedAt": "2025-12-01T12:34:56Z"
 *       },
 *       ...
 *     ]
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
import { getTopProjectsForUser, TopProjectEntry } from '../../../../../../server/userCtActivity';

// =============================================================================
// TYPES
// =============================================================================

type TopProjectsResponse =
  | {
      ok: true;
      userId: string;
      sourceWindow: string;
      projects: TopProjectEntry[];
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

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TopProjectsResponse>
) {
  // Only allow GET
  if (req.method !== 'GET') {
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

    const currentUserId = session.user_id;

    // Parse userId from route parameter
    const { userId } = req.query;
    
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing userId parameter' });
    }

    let targetUserId: string;

    if (userId === 'me') {
      // "me" → current user
      targetUserId = currentUserId;
    } else if (isValidUUID(userId)) {
      // Explicit UUID - check permissions
      // For now, users can only view their own profile
      // In the future, we can add public profile support
      if (userId !== currentUserId) {
        // Check if target user has a public profile
        // For Phase 1, we only allow viewing your own profile
        return res.status(403).json({ 
          ok: false, 
          error: 'You can only view your own top projects' 
        });
      }
      targetUserId = userId;
    } else {
      return res.status(400).json({ ok: false, error: 'Invalid userId format' });
    }

    // Get optional source window from query (default: 'last_200_tweets')
    const sourceWindow = typeof req.query.sourceWindow === 'string'
      ? req.query.sourceWindow
      : 'last_200_tweets';

    // Fetch top projects
    const result = await getTopProjectsForUser(targetUserId, sourceWindow, 5);

    if (!result.ok) {
      console.error(`[Top Projects] Error fetching for user ${targetUserId}:`, result.error);
      return res.status(500).json({ ok: false, error: result.error || 'Failed to fetch top projects' });
    }

    return res.status(200).json({
      ok: true,
      userId: targetUserId,
      sourceWindow,
      projects: result.projects,
    });

  } catch (error: any) {
    console.error('[Top Projects] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
