/**
 * API Route: /api/portal/brands/[brandId]
 *
 * GET: Brand details + campaigns
 * PATCH: Update brand (owner only)
 * DELETE: Delete brand (owner only)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { taioGetUserInfo } from '@/server/twitterapiio';

type Response =
  | {
      ok: true;
      brand: any;
      campaigns: any[];
      isOwner: boolean;
      membersCount: number;
      pendingRequests: any[];
      analytics: {
        trackingSince: string | null;
        totalQuests: number;
        totalSubmissions: number;
        totalClicks: number;
      };
      series: Array<{ date: string; clicks: number; submissions: number; verifiedX: number }>;
    }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const brandId = req.query.brandId as string | undefined;
  if (!brandId) {
    return res.status(400).json({ ok: false, error: 'brandId is required' });
  }

  const { data: brand, error: brandError } = await supabase
    .from('brand_profiles')
    .select('id, owner_user_id, name, x_handle, website, tg_community, tg_channel, brief_text, logo_url, banner_url, created_at, verification_status, verified_at')
    .eq('id', brandId)
    .single();

  if (brandError || !brand) {
    return res.status(404).json({ ok: false, error: 'Brand not found' });
  }

  const { data: campaigns } = await supabase
    .from('brand_campaigns')
    .select('id, name, pitch, objectives, campaign_type, status, launch_status, languages, created_at, start_at, end_at')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false });

  const campaignIds = (campaigns || []).map((c: any) => c.id);
  const { data: submissions } = campaignIds.length
    ? await supabase
        .from('campaign_submissions')
        .select('campaign_id, platform, status, verified_at, used_campaign_link, engagement_score, submitted_at')
        .in('campaign_id', campaignIds)
    : { data: [] };

  const { data: events } = campaignIds.length
    ? await supabase
        .from('campaign_utm_events')
        .select('campaign_id, event_type, created_at')
        .in('campaign_id', campaignIds)
    : { data: [] };

  const submissionAgg = (submissions || []).reduce<Record<string, any>>((acc, row: any) => {
    if (!acc[row.campaign_id]) {
      acc[row.campaign_id] = {
        totalSubmissions: 0,
        verifiedX: 0,
        usedLinkCount: 0,
        engagementScore: 0,
      };
    }
    acc[row.campaign_id].totalSubmissions += 1;
    if (row.platform === 'x' && row.verified_at) {
      acc[row.campaign_id].verifiedX += 1;
    }
    if (row.used_campaign_link) {
      acc[row.campaign_id].usedLinkCount += 1;
    }
    acc[row.campaign_id].engagementScore += Number(row.engagement_score || 0);
    return acc;
  }, {});

  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const clickAgg = (events || []).reduce<Record<string, any>>((acc, row: any) => {
    if (row.event_type !== 'click') return acc;
    if (!acc[row.campaign_id]) {
      acc[row.campaign_id] = { totalClicks: 0, last24hClicks: 0, last1hClicks: 0 };
    }
    acc[row.campaign_id].totalClicks += 1;
    const createdAt = row.created_at ? new Date(row.created_at) : null;
    if (createdAt && createdAt > dayAgo) acc[row.campaign_id].last24hClicks += 1;
    if (createdAt && createdAt > oneHourAgo) acc[row.campaign_id].last1hClicks += 1;
    return acc;
  }, {});

  const campaignsWithAnalytics = (campaigns || []).map((c: any) => ({
    ...c,
    totalSubmissions: submissionAgg[c.id]?.totalSubmissions || 0,
    verifiedX: submissionAgg[c.id]?.verifiedX || 0,
    usedLinkCount: submissionAgg[c.id]?.usedLinkCount || 0,
    engagementScore: submissionAgg[c.id]?.engagementScore || 0,
    totalClicks: clickAgg[c.id]?.totalClicks || 0,
    last24hClicks: clickAgg[c.id]?.last24hClicks || 0,
    last1hClicks: clickAgg[c.id]?.last1hClicks || 0,
  }));

  const seriesMap = new Map<string, { date: string; clicks: number; submissions: number; verifiedX: number }>();
  const days = 30;
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    seriesMap.set(key, { date: key, clicks: 0, submissions: 0, verifiedX: 0 });
  }

  for (const ev of events || []) {
    if (ev.event_type !== 'click' || !ev.created_at) continue;
    const key = new Date(ev.created_at).toISOString().slice(0, 10);
    const row = seriesMap.get(key);
    if (row) row.clicks += 1;
  }

  for (const sub of submissions || []) {
    if (!sub.submitted_at) continue;
    const key = new Date(sub.submitted_at).toISOString().slice(0, 10);
    const row = seriesMap.get(key);
    if (row) row.submissions += 1;
    if (sub.platform === 'x' && sub.verified_at && row) {
      row.verifiedX += 1;
    }
  }

  const series = Array.from(seriesMap.values());
  const [submissionCount, clickCount] = await Promise.all([
    campaignIds.length
      ? supabase
          .from('campaign_submissions')
          .select('*', { count: 'exact', head: true })
          .in('campaign_id', campaignIds)
      : Promise.resolve({ count: 0 }),
    campaignIds.length
      ? supabase
          .from('campaign_utm_events')
          .select('*', { count: 'exact', head: true })
          .eq('event_type', 'click')
          .in('campaign_id', campaignIds)
      : Promise.resolve({ count: 0 }),
  ]);

  const { count } = await supabase
    .from('brand_members')
    .select('*', { count: 'exact', head: true })
    .eq('brand_id', brandId);

  const isOwner = brand.owner_user_id === user.userId;
  let pendingRequests: any[] = [];

  if (isOwner) {
    if (campaignIds.length > 0) {
      const { data: pending } = await supabase
        .from('brand_campaign_creators')
        .select('id, username, status, campaign_id')
        .in('campaign_id', campaignIds)
        .eq('status', 'pending')
        .order('joined_at', { ascending: true });

      const campaignNameMap = (campaigns || []).reduce<Record<string, string>>((acc, c: any) => {
        acc[c.id] = c.name;
        return acc;
      }, {});

      pendingRequests = (pending || []).map((row: any) => ({
        id: row.id,
        username: row.username,
        campaign_id: row.campaign_id,
        campaign_name: campaignNameMap[row.campaign_id] || 'Campaign',
      }));
    }
  }

  return res.status(200).json({
    ok: true,
    brand,
    campaigns: campaignsWithAnalytics || [],
    isOwner,
    membersCount: count || 0,
    pendingRequests,
    analytics: {
      trackingSince: brand.created_at,
      totalQuests: campaignIds.length,
      totalSubmissions: submissionCount.count || 0,
      totalClicks: clickCount.count || 0,
    },
    series,
  });
}
