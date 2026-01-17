/**
 * API Route: /api/portal/brands/analytics
 *
 * GET: Aggregated live analytics for CRM owners
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | { ok: true; summary: any; quests: any[] }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const { data: brands, error: brandError } = await supabase
    .from('brand_profiles')
    .select('id, name, logo_url, x_handle')
    .eq('owner_user_id', user.userId);

  if (brandError) {
    return res.status(500).json({ ok: false, error: 'Failed to load brands' });
  }

  const brandIds = (brands || []).map((b: any) => b.id);
  if (brandIds.length === 0) {
    return res.status(200).json({ ok: true, summary: { totalClicks: 0, totalSubmissions: 0 }, quests: [] });
  }

  const { data: campaigns } = await supabase
    .from('brand_campaigns')
    .select('id, brand_id, name, campaign_type, status, launch_status, start_at, end_at, brand_profiles (id, name, logo_url, x_handle, verification_status)')
    .in('brand_id', brandIds);

  const now = Date.now();
  const liveCampaigns = (campaigns || []).filter((c: any) => {
    if (c.launch_status && c.launch_status !== 'approved') return false;
    const brandProfile = Array.isArray(c.brand_profiles) ? c.brand_profiles[0] : c.brand_profiles;
    if (brandProfile?.verification_status && brandProfile.verification_status !== 'approved') return false;
    const start = c.start_at ? new Date(c.start_at).getTime() : null;
    const end = c.end_at ? new Date(c.end_at).getTime() : null;
    const hasStarted = start ? start <= now : true;
    const notEnded = end ? end >= now : true;
    return hasStarted && notEnded;
  });

  const campaignIds = liveCampaigns.map((c: any) => c.id);

  const { data: submissions } = await supabase
    .from('campaign_submissions')
    .select('campaign_id, platform, verified_at, used_campaign_link, engagement_score')
    .in('campaign_id', campaignIds.length ? campaignIds : ['00000000-0000-0000-0000-000000000000']);

  const { data: events } = await supabase
    .from('campaign_utm_events')
    .select('campaign_id, event_type, created_at')
    .in('campaign_id', campaignIds.length ? campaignIds : ['00000000-0000-0000-0000-000000000000']);

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

  const hourAgo = now - 60 * 60 * 1000;
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const clickAgg = (events || []).reduce<Record<string, any>>((acc, row: any) => {
    if (row.event_type !== 'click') return acc;
    if (!acc[row.campaign_id]) {
      acc[row.campaign_id] = { totalClicks: 0, last24h: 0, last1h: 0 };
    }
    acc[row.campaign_id].totalClicks += 1;
    const ts = row.created_at ? new Date(row.created_at).getTime() : 0;
    if (ts >= dayAgo) acc[row.campaign_id].last24h += 1;
    if (ts >= hourAgo) acc[row.campaign_id].last1h += 1;
    return acc;
  }, {});

  const normalized = liveCampaigns.map((c: any) => {
    const brandProfile = Array.isArray(c.brand_profiles) ? c.brand_profiles[0] : c.brand_profiles;
    return {
      id: c.id,
      name: c.name,
      campaign_type: c.campaign_type,
      status: c.status,
      start_at: c.start_at,
      end_at: c.end_at,
      brand: brandProfile,
      totalSubmissions: submissionAgg[c.id]?.totalSubmissions || 0,
      verifiedX: submissionAgg[c.id]?.verifiedX || 0,
      usedLinkCount: submissionAgg[c.id]?.usedLinkCount || 0,
      engagementScore: submissionAgg[c.id]?.engagementScore || 0,
      totalClicks: clickAgg[c.id]?.totalClicks || 0,
      last24hClicks: clickAgg[c.id]?.last24h || 0,
      last1hClicks: clickAgg[c.id]?.last1h || 0,
    };
  });

  const summary = normalized.reduce(
    (acc: any, row: any) => {
      acc.totalClicks += row.totalClicks;
      acc.totalSubmissions += row.totalSubmissions;
      acc.totalVerifiedX += row.verifiedX;
      return acc;
    },
    { totalClicks: 0, totalSubmissions: 0, totalVerifiedX: 0 }
  );

  return res.status(200).json({ ok: true, summary, quests: normalized });
}
