/**
 * API Route: /api/portal/brands/campaigns/my-submissions
 *
 * GET: list submissions for current creator
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type Response =
  | { ok: true; submissions: any[]; profileId: string | null }
  | { ok: false; error: string };

async function resolveProfileId(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<string | null> {
  let { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', userId)
    .in('provider', ['x', 'twitter'])
    .maybeSingle();

  if (!xIdentity?.username) {
    const { data: fallbackIdentity } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .not('username', 'is', null)
      .maybeSingle();
    xIdentity = fallbackIdentity || xIdentity;
  }

  const username = xIdentity?.username ? xIdentity.username.toLowerCase().replace('@', '').trim() : null;
  if (!username) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  return profile?.id || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  let profileId = user.profileId;
  if (!profileId) {
    profileId = await resolveProfileId(supabase, user.userId);
  }
  if (!profileId) {
    return res.status(200).json({ ok: true, submissions: [], profileId: null });
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
    .eq('creator_profile_id', profileId)
    .order('submitted_at', { ascending: false });

  if (error) {
    return res.status(500).json({ ok: false, error: 'Failed to load submissions' });
  }

  const campaignIds = (submissions || []).map((s: any) => s.campaign_id);
  const { data: clicks } = await supabase
    .from('campaign_utm_events')
    .select('campaign_id, creator_profile_id, event_type')
    .eq('creator_profile_id', profileId)
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

  return res.status(200).json({ ok: true, submissions: normalized, profileId });
}
