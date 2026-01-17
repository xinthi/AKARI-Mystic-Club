/**
 * API Route: /api/portal/brands/[brandId]
 *
 * GET: Brand details + campaigns
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

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

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { data: brand, error: brandError } = await supabase
    .from('brand_profiles')
    .select('id, owner_user_id, name, x_handle, website, tg_community, tg_channel, brief_text, logo_url, created_at, verification_status, verified_at')
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
    campaigns: campaigns || [],
    isOwner,
    membersCount: count || 0,
    pendingRequests,
    analytics: {
      trackingSince: brand.created_at,
      totalQuests: campaignIds.length,
      totalSubmissions: submissionCount.count || 0,
      totalClicks: clickCount.count || 0,
    },
  });
}
