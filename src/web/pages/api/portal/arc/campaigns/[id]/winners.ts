/**
 * API Route: GET /api/portal/arc/campaigns/[id]/winners
 * 
 * Get top N winners from campaign leaderboard.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// =============================================================================
// TYPES
// =============================================================================

interface Winner {
  rank: number;
  twitter_username: string;
  score: number;
  tweet_count?: number;
  likes?: number;
  retweets?: number;
  replies?: number;
}

type WinnersResponse =
  | { ok: true; winners: Winner[] }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WinnersResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { id: campaignId } = req.query;
    const topN = parseInt(req.query.top as string) || undefined;

    if (!campaignId || typeof campaignId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Campaign ID is required' });
    }

    // Get campaign to find winners_count
    const { data: campaign, error: campaignError } = await supabase
      .from('arc_campaigns')
      .select('winners_count')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    // Get participants and calculate scores (reuse leaderboard logic)
    const { data: participants } = await supabase
      .from('arc_campaign_participants')
      .select('id, twitter_username')
      .eq('campaign_id', campaignId)
      .in('status', ['invited', 'accepted', 'tracked']);

    if (!participants || participants.length === 0) {
      return res.status(200).json({ ok: true, winners: [] });
    }

    // Get campaign dates
    const { data: campaignDates } = await supabase
      .from('arc_campaigns')
      .select('start_at, end_at, project_id')
      .eq('id', campaignId)
      .single();

    if (!campaignDates) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    const startDate = new Date(campaignDates.start_at).toISOString();
    const endDate = new Date(campaignDates.end_at).toISOString();

    const leaderboard: any[] = [];

    for (const participant of participants) {
      const username = participant.twitter_username.toLowerCase().replace('@', '').trim();
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      let score = 0;
      let tweetCount = 0;

      if (profile) {
        const { data: activities } = await supabase
          .from('user_ct_activity')
          .select('likes, retweets, replies')
          .eq('project_id', campaignDates.project_id)
          .gte('tweeted_at', startDate)
          .lte('tweeted_at', endDate);

        if (activities && activities.length > 0) {
          tweetCount = activities.length;
          const totalLikes = activities.reduce((sum, a) => sum + (a.likes || 0), 0);
          const totalRetweets = activities.reduce((sum, a) => sum + (a.retweets || 0), 0);
          const totalReplies = activities.reduce((sum, a) => sum + (a.replies || 0), 0);
          score = tweetCount + totalLikes * 0.1 + totalRetweets * 0.5 + totalReplies * 0.2;
        }
      }

      leaderboard.push({
        rank: 0,
        twitter_username: participant.twitter_username,
        score: Math.round(score * 100) / 100,
        tweet_count: tweetCount,
      });
    }

    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    // Get top N winners
    const winnersCount = topN || campaign.winners_count || 100;
    const winners = leaderboard.slice(0, winnersCount);

    return res.status(200).json({
      ok: true,
      winners,
    });
  } catch (error: any) {
    console.error('[ARC Winners API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

