/**
 * API Route: GET /api/portal/arc/live-leaderboards
 * 
 * Returns live and upcoming ARC items (arenas, campaigns, gamified) with project information.
 * Limited to 10-20 results.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getArcLiveItems, ArcLiveItem } from '@/lib/arc/live-upcoming';

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
  kind: 'arena' | 'campaign' | 'gamified';
  status?: 'live' | 'upcoming' | 'paused' | 'ended';
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

    // Get limit from query (default 15)
    const limit = Math.min(parseInt(req.query.limit as string) || 15, 20);

    // Get all live and upcoming items using unified helper
    const { live, upcoming } = await getArcLiveItems(supabase, limit);
    
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
      }

      // Add project access level for routing
      result.projectAccessLevel = item.projectAccessLevel || null;
      
      // Add status for UI display
      result.status = item.status || 'live';

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

