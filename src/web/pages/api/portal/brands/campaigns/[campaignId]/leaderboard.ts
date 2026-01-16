/**
 * API Route: /api/portal/brands/campaigns/[campaignId]/leaderboard
 *
 * GET: analytics-only leaderboard for campaign
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | { ok: true; rows: any[] }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const campaignId = (req.query.campaignId ?? req.query.questId) as string | undefined;
  if (!campaignId) {
    return res.status(400).json({ ok: false, error: 'campaignId is required' });
  }

  const { data: creators } = await supabase
    .from('brand_campaign_creators')
    .select('id, profile_id, username, status')
    .eq('campaign_id', campaignId)
    .in('status', ['approved', 'pending']);

  const creatorIds = (creators || []).map((c: any) => c.profile_id).filter(Boolean);

  const { data: submissions } = await supabase
    .from('campaign_submissions')
    .select('creator_profile_id, platform, like_count, reply_count, repost_count, view_count, engagement_score')
    .eq('campaign_id', campaignId);

  const { data: events } = await supabase
    .from('campaign_utm_events')
    .select('creator_profile_id, event_type, source_platform, location')
    .eq('campaign_id', campaignId);

  const profileRows = creatorIds.length
    ? await supabase
        .from('profiles')
        .select('id, username, profile_image_url')
        .in('id', creatorIds)
    : { data: [] as any[] };

  const profileMap = (profileRows.data || []).reduce<Record<string, any>>((acc, row: any) => {
    acc[row.id] = row;
    return acc;
  }, {});

  const submissionAgg = (submissions || []).reduce<Record<string, any>>((acc, row: any) => {
    const creatorId = row.creator_profile_id || 'unknown';
    if (!acc[creatorId]) {
      acc[creatorId] = {
        platforms: {},
        engagementScore: 0,
      };
    }
    acc[creatorId].engagementScore += Number(row.engagement_score || 0);
    const platform = row.platform || 'x';
    acc[creatorId].platforms[platform] = (acc[creatorId].platforms[platform] || 0) + 1;
    return acc;
  }, {});

  const clickAgg = (events || []).reduce<Record<string, any>>((acc, row: any) => {
    const creatorId = row.creator_profile_id || 'unknown';
    if (!acc[creatorId]) {
      acc[creatorId] = { clicks: 0, conversions: 0 };
    }
    if (row.event_type === 'click') acc[creatorId].clicks += 1;
    if (row.event_type === 'conversion') acc[creatorId].conversions += 1;
    return acc;
  }, {});

  const rows = (creators || []).map((c: any) => {
    const profile = c.profile_id ? profileMap[c.profile_id] : null;
    const engagementScore = submissionAgg[c.profile_id]?.engagementScore || 0;
    const clicks = clickAgg[c.profile_id]?.clicks || 0;
    const totalScore = engagementScore + clicks;
    return {
      creator_profile_id: c.profile_id,
      username: c.username || profile?.username || 'unknown',
      avatar_url: profile?.profile_image_url || null,
      status: c.status,
      platforms: submissionAgg[c.profile_id]?.platforms || {},
      engagementScore,
      clicks,
      totalScore,
    };
  });

  rows.sort((a, b) => b.totalScore - a.totalScore);

  return res.status(200).json({ ok: true, rows });
}
