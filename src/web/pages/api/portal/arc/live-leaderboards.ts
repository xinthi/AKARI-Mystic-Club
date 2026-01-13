/**
 * API Route: GET /api/portal/arc/live-leaderboards
 * 
 * Returns live and upcoming ARC items (arenas, campaigns, gamified) with project information.
 * Limited to 10-20 results.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getArcLiveItems, ArcLiveItem } from '@/lib/arc/live-upcoming';
import { isSuperAdminServerSide } from '@/lib/server-auth';

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

async function getUserIdFromSession(sessionToken: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data: session } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (!session || new Date(session.expires_at) < new Date()) {
    return null;
  }

  return session.user_id;
}

// =============================================================================
// TYPES
// =============================================================================

interface LiveLeaderboard {
  arenaId?: string;
  arenaName?: string;
  arenaSlug?: string;
  campaignId?: string;
  projectId: string;
  projectName: string;
  projectSlug: string | null;
  projectAccessLevel?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' | null;
  xHandle: string | null;
  creatorCount: number;
  startAt: string | null;
  endAt: string | null;
  title: string;
  kind: 'arena' | 'campaign' | 'gamified' | 'crm';
  status?: 'live' | 'upcoming' | 'paused' | 'ended';
  programId?: string;
  visibility?: 'private' | 'public' | 'hybrid';
}

type LiveLeaderboardsResponse =
  | { ok: true; leaderboards: LiveLeaderboard[]; upcoming: LiveLeaderboard[] }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LiveLeaderboardsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Check if user is superadmin (for bypassing access checks)
    // IMPORTANT: Always try to bypass for superadmin to ensure they see all items
    let bypassAccessCheck = false;
    let bypassReason = 'not_checked';
    try {
      const sessionToken = getSessionToken(req);
      if (sessionToken) {
        const userId = await getUserIdFromSession(sessionToken);
        if (userId) {
          bypassAccessCheck = await isSuperAdminServerSide(userId);
          bypassReason = bypassAccessCheck ? 'superadmin' : 'not_superadmin';
          if (bypassAccessCheck) {
            console.log('[Live Leaderboards API] 🔓 SuperAdmin detected - bypassing access checks');
          } else {
            console.log('[Live Leaderboards API] User is not superadmin - access checks will be enforced');
          }
        } else {
          bypassReason = 'no_user_id';
          console.log('[Live Leaderboards API] No user ID found in session');
        }
      } else {
        bypassReason = 'no_session_token';
        console.log('[Live Leaderboards API] No session token found');
      }
    } catch (err: any) {
      // If auth check fails, log but continue without bypass
      bypassReason = `error: ${err.message}`;
      console.warn('[Live Leaderboards API] Could not check superadmin status:', err);
    }
    
    console.log(`[Live Leaderboards API] Access check bypass: ${bypassAccessCheck} (reason: ${bypassReason})`);

    // Get limit from query (default 15)
    const limit = Math.min(parseInt(req.query.limit as string) || 15, 20);

    // Get all live and upcoming items using unified helper
    const { live, upcoming } = await getArcLiveItems(supabase, limit, bypassAccessCheck);
    
    // Log summary for debugging
    console.log(`[Live Leaderboards API] ========================================`);
    console.log(`[Live Leaderboards API] Returning ${live.length} live and ${upcoming.length} upcoming items`);
    
    // Log which projects are included
    if (live.length > 0) {
      console.log(`[Live Leaderboards API] ✅ Live items found:`, live.map(item => ({
        project: item.projectName,
        projectId: item.projectId,
        projectSlug: item.projectSlug,
        kind: item.kind,
        title: item.title,
        slug: item.slug,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
      })));
    } else {
      console.log(`[Live Leaderboards API] ⚠️ No live items found. Check server logs above for access check failures.`);
    }
    
    if (upcoming.length > 0) {
      console.log(`[Live Leaderboards API] ⏳ Upcoming items found:`, upcoming.map(item => ({
        project: item.projectName,
        projectId: item.projectId,
        kind: item.kind,
        title: item.title,
        startsAt: item.startsAt,
      })));
    }
    console.log(`[Live Leaderboards API] ========================================`);

    // Convert ArcLiveItem to LiveLeaderboard format (backward compatible)
    const convertToLiveLeaderboard = (item: ArcLiveItem): LiveLeaderboard => {
      const result: LiveLeaderboard = {
        projectId: item.projectId,
        projectName: item.projectName,
        projectSlug: item.projectSlug,
        xHandle: item.xHandle,
        creatorCount: item.creatorCount || 0,
        startAt: item.startsAt,
        endAt: item.endsAt,
        title: item.title,
        kind: item.kind,
      };

      // Add kind-specific fields for backward compatibility
      if (item.kind === 'arena') {
        result.arenaId = item.arenaId || item.id;
        result.arenaName = item.title;
        result.arenaSlug = item.arenaSlug || item.slug || undefined;
      } else if (item.kind === 'campaign') {
        result.campaignId = item.campaignId || item.id;
      } else if (item.kind === 'crm') {
        result.programId = item.programId || item.id;
      }

      // Add project access level for routing
      result.projectAccessLevel = item.projectAccessLevel || null;
      
      // Add status for UI display
      result.status = item.status || 'live';
      
      // Add visibility for CRM programs
      if (item.visibility) {
        result.visibility = item.visibility;
      }

      return result;
    };

    const leaderboards = live.map(convertToLiveLeaderboard);
    const upcomingFormatted = upcoming.map(convertToLiveLeaderboard);

    return res.status(200).json({ ok: true, leaderboards, upcoming: upcomingFormatted });
  } catch (error: any) {
    console.error('[Live Leaderboards] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

