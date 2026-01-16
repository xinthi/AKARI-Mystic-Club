/**
 * API Route: /api/portal/brands/campaigns/my-submissions
 *
 * GET: list submissions for current creator
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | { ok: true; submissions: any[]; profileId: string }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  if (!user.profileId) {
    return res.status(403).json({ ok: false, error: 'Profile not found' });
  }

  const { data: submissions, error } = await supabase
    .from('campaign_submissions')
    .select(`
      id,
      campaign_id,
      platform,
      post_url,
      submitted_at,
      status,
      brand_campaigns (
        id,
        name,
        brand_id,
        brand_profiles (
          id,
          name,
          logo_url
        )
      )
    `)
    .eq('creator_profile_id', user.profileId)
    .order('submitted_at', { ascending: false });

  if (error) {
    return res.status(500).json({ ok: false, error: 'Failed to load submissions' });
  }

  const campaignIds = (submissions || []).map((s: any) => s.campaign_id);
  const { data: clicks } = await supabase
    .from('campaign_utm_events')
    .select('campaign_id, creator_profile_id, event_type')
    .eq('creator_profile_id', user.profileId)
    .in('campaign_id', campaignIds.length ? campaignIds : ['00000000-0000-0000-0000-000000000000']);

  const clickMap = (clicks || []).reduce<Record<string, number>>((acc, row: any) => {
    if (row.event_type !== 'click') return acc;
    acc[row.campaign_id] = (acc[row.campaign_id] || 0) + 1;
    return acc;
  }, {});

  const normalized = (submissions || []).map((s: any) => ({
    id: s.id,
    campaign_id: s.campaign_id,
    platform: s.platform,
    post_url: s.post_url,
    submitted_at: s.submitted_at,
    status: s.status,
    campaign: s.brand_campaigns
      ? {
          id: s.brand_campaigns.id,
          name: s.brand_campaigns.name,
          brand: s.brand_campaigns.brand_profiles
            ? {
                id: s.brand_campaigns.brand_profiles.id,
                name: s.brand_campaigns.brand_profiles.name,
                logo_url: s.brand_campaigns.brand_profiles.logo_url,
              }
            : null,
        }
      : null,
    clicks: clickMap[s.campaign_id] || 0,
  }));

  return res.status(200).json({ ok: true, submissions: normalized, profileId: user.profileId });
}
