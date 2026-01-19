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
    .in('status', ['approved', 'pending', 'invited']);

  const creatorIds = (creators || []).map((c: any) => c.profile_id).filter(Boolean);

  const { data: submissions } = await supabase
    .from('campaign_submissions')
    .select('creator_profile_id, platform, status, engagement_score, verified_at, used_campaign_link, like_count, reply_count, repost_count, view_count, qualified')
    .eq('campaign_id', campaignId);

  const { data: events } = await supabase
    .from('campaign_utm_events')
    .select('creator_profile_id, event_type, created_at, source_platform')
    .eq('campaign_id', campaignId);

  const submissionAgg = (submissions || []).reduce<Record<string, any>>((acc, row: any) => {
    const creatorId = row.creator_profile_id || 'unknown';
    if (!acc[creatorId]) {
      acc[creatorId] = {
        platforms: {},
        engagementScore: 0,
        submittedPostsCount: 0,
        verifiedXPostsCount: 0,
        usedCampaignLinkCount: 0,
        qualifiedXPostsCount: 0,
        xLikes: 0,
        xReplies: 0,
        xReposts: 0,
        xViews: 0,
      };
    }
    const platform = row.platform || 'x';
    const isX = platform === 'x';
    const isQualifiedX = !isX || row.qualified !== false;
    if (!isQualifiedX) {
      return acc;
    }
    acc[creatorId].platforms[platform] = (acc[creatorId].platforms[platform] || 0) + 1;
    acc[creatorId].submittedPostsCount += 1;
    acc[creatorId].engagementScore += Number(row.engagement_score || 0);
    if (isX && row.verified_at) {
      acc[creatorId].verifiedXPostsCount += 1;
      if (row.qualified) acc[creatorId].qualifiedXPostsCount += 1;
      acc[creatorId].xLikes += Number(row.like_count || 0);
      acc[creatorId].xReplies += Number(row.reply_count || 0);
      acc[creatorId].xReposts += Number(row.repost_count || 0);
      acc[creatorId].xViews += Number(row.view_count || 0);
    }
    if (row.used_campaign_link) {
      acc[creatorId].usedCampaignLinkCount += 1;
    }
    return acc;
  }, {});

  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const allowedPlatforms = new Set(['x', 'youtube', 'tiktok', 'telegram', 'linkedin', 'instagram', 'other']);
  const clickAgg = (events || []).reduce<Record<string, any>>((acc, row: any) => {
    const creatorId = row.creator_profile_id || 'unknown';
    if (!acc[creatorId]) {
      acc[creatorId] = {
        clicks: 0,
        last24h: 0,
        last1h: 0,
        byPlatform: {},
        byPlatform24h: {},
        byPlatform1h: {},
      };
    }
    if (row.event_type === 'click') {
      acc[creatorId].clicks += 1;
      const ts = row.created_at ? new Date(row.created_at).getTime() : 0;
      if (ts >= dayAgo) acc[creatorId].last24h += 1;
      if (ts >= hourAgo) acc[creatorId].last1h += 1;
      const platform = row.source_platform && allowedPlatforms.has(String(row.source_platform))
        ? String(row.source_platform)
        : null;
      if (platform) {
        acc[creatorId].byPlatform[platform] = (acc[creatorId].byPlatform[platform] || 0) + 1;
        if (ts >= dayAgo) {
          acc[creatorId].byPlatform24h[platform] = (acc[creatorId].byPlatform24h[platform] || 0) + 1;
        }
        if (ts >= hourAgo) {
          acc[creatorId].byPlatform1h[platform] = (acc[creatorId].byPlatform1h[platform] || 0) + 1;
        }
      }
    }
    return acc;
  }, {});

  const extraCreatorIds = (events || [])
    .map((e: any) => e.creator_profile_id)
    .filter((id: any) => id && !creatorIds.includes(id));
  const allCreatorIds = Array.from(new Set([...creatorIds, ...extraCreatorIds]));

  const profileRows = allCreatorIds.length
    ? await supabase
        .from('profiles')
        .select('id, username, profile_image_url')
        .in('id', allCreatorIds)
    : { data: [] as any[] };

  const profileMap = (profileRows.data || []).reduce<Record<string, any>>((acc, row: any) => {
    acc[row.id] = row;
    return acc;
  }, {});

  const rows = allCreatorIds.map((creatorId: string) => {
    const creator = (creators || []).find((c: any) => c.profile_id === creatorId);
    const profile = creatorId ? profileMap[creatorId] : null;
    const engagementScore = submissionAgg[creatorId]?.engagementScore || 0;
    const clicks = clickAgg[creatorId]?.clicks || 0;
    const last24hClicks = clickAgg[creatorId]?.last24h || 0;
    const last1hClicks = clickAgg[creatorId]?.last1h || 0;
    const clicksByPlatform = clickAgg[creatorId]?.byPlatform || {};
    const last24hClicksByPlatform = clickAgg[creatorId]?.byPlatform24h || {};
    const last1hClicksByPlatform = clickAgg[creatorId]?.byPlatform1h || {};
    const submittedPostsCount = submissionAgg[creatorId]?.submittedPostsCount || 0;
    const verifiedXPostsCount = submissionAgg[creatorId]?.verifiedXPostsCount || 0;
    const usedCampaignLinkCount = submissionAgg[creatorId]?.usedCampaignLinkCount || 0;
    const qualifiedXPostsCount = submissionAgg[creatorId]?.qualifiedXPostsCount || 0;
    const xAvgEngagement = verifiedXPostsCount > 0 ? Math.round(engagementScore / verifiedXPostsCount) : 0;
    const xLikes = submissionAgg[creatorId]?.xLikes || 0;
    const xReplies = submissionAgg[creatorId]?.xReplies || 0;
    const xReposts = submissionAgg[creatorId]?.xReposts || 0;
    const xViews = submissionAgg[creatorId]?.xViews || 0;
    const totalScore = clicks + engagementScore;
    return {
      creator_profile_id: creatorId,
      username: creator?.username || profile?.username || 'unknown',
      avatar_url: profile?.profile_image_url || null,
      status: creator?.status || 'unknown',
      platforms: submissionAgg[creatorId]?.platforms || {},
      submittedPostsCount,
      verifiedXPostsCount,
      qualifiedXPostsCount,
      usedCampaignLinkCount,
      engagementScore,
      xAvgEngagement,
      clicks,
      last24hClicks,
      last1hClicks,
      clicksByPlatform,
      last24hClicksByPlatform,
      last1hClicksByPlatform,
      xLikes,
      xReplies,
      xReposts,
      xViews,
      hasSubmissions: submittedPostsCount > 0,
      totalScore,
    };
  });

  rows.sort((a, b) => {
    if (b.clicks !== a.clicks) return b.clicks - a.clicks;
    if (b.engagementScore !== a.engagementScore) return b.engagementScore - a.engagementScore;
    return b.verifiedXPostsCount - a.verifiedXPostsCount;
  });

  return res.status(200).json({ ok: true, rows });
}
