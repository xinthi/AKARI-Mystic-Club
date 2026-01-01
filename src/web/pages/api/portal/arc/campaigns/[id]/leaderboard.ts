/**
 * API Route: GET /api/portal/arc/campaigns/[id]/leaderboard
 * 
 * Get leaderboard for a campaign (clicks per participant).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';

// =============================================================================
// TYPES
// =============================================================================

interface LeaderboardEntry {
  participant_id: string;
  twitter_username: string;
  profile_id: string | null;
  clicks: number;
  unique_clicks: number;
}

type LeaderboardResponse =
  | { ok: true; entries: LeaderboardEntry[] }
  | { ok: false; error: string };

const DEV_MODE = process.env.NODE_ENV === 'development' && process.env.DEV_MODE === 'true';

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LeaderboardResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { id: campaignId } = req.query;

    if (!campaignId || typeof campaignId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Campaign ID is required' });
    }

    // Get campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('arc_campaigns')
      .select('project_id, leaderboard_visibility')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    // Check access for private campaigns
    if (campaign.leaderboard_visibility === 'private' && !DEV_MODE) {
      const projectId = campaign.project_id;
      if (projectId && typeof projectId === 'string') {
        const accessCheck = await requireArcAccess(supabase, projectId, 1);
        if (!accessCheck.ok) {
          return res.status(403).json({
            ok: false,
            error: 'This leaderboard is private',
          });
        }
      }
    }

    // Get all participants for this campaign
    const { data: participants, error: participantsError } = await supabase
      .from('arc_campaign_participants')
      .select('id, twitter_username, profile_id')
      .eq('campaign_id', campaignId);

    if (participantsError) {
      console.error('[Campaign Leaderboard] Error fetching participants:', participantsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch participants' });
    }

    // Get all link events for this campaign
    const { data: linkEvents, error: eventsError } = await supabase
      .from('arc_link_events')
      .select('participant_id, visitor_id')
      .eq('campaign_id', campaignId);

    if (eventsError) {
      console.error('[Campaign Leaderboard] Error fetching events:', eventsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch click events' });
    }

    // Calculate clicks per participant
    const participantMap = new Map<string, { clicks: number; uniqueVisitors: Set<string> }>();

    (linkEvents || []).forEach((event: any) => {
      const pid = event.participant_id;
      if (!participantMap.has(pid)) {
        participantMap.set(pid, { clicks: 0, uniqueVisitors: new Set() });
      }
      const stats = participantMap.get(pid)!;
      stats.clicks++;
      if (event.visitor_id) {
        stats.uniqueVisitors.add(event.visitor_id);
      }
    });

    // Build leaderboard entries
    const entries: LeaderboardEntry[] = (participants || []).map((p: any) => {
      const stats = participantMap.get(p.id) || { clicks: 0, uniqueVisitors: new Set() };
      return {
        participant_id: p.id,
        twitter_username: p.twitter_username,
        profile_id: p.profile_id,
        clicks: stats.clicks,
        unique_clicks: stats.uniqueVisitors.size,
      };
    });

    // Sort by unique_clicks desc, then clicks desc
    entries.sort((a, b) => {
      if (b.unique_clicks !== a.unique_clicks) {
        return b.unique_clicks - a.unique_clicks;
      }
      return b.clicks - a.clicks;
    });

    return res.status(200).json({
      ok: true,
      entries,
    });
  } catch (error: any) {
    console.error('[Campaign Leaderboard] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
