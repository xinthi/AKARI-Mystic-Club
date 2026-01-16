/**
 * API Route: /api/portal/brands/campaigns
 *
 * GET: Creator campaign discovery (public + invited/joined)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { taioGetUserInfo } from '@/server/twitterapiio';

type Response =
  | { ok: true; campaigns: any[] }
  | { ok: false; error: string };

async function getUserTwitterUsername(
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

  return xIdentity?.username ? xIdentity.username.toLowerCase().replace('@', '').trim() : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const twitterUsername = await getUserTwitterUsername(supabase, user.userId);

  const { data: campaigns, error } = await supabase
    .from('brand_campaigns')
    .select(`
      id,
      brand_id,
      name,
      pitch,
      objectives,
      campaign_type,
      status,
      languages,
      start_at,
      end_at,
      brand_profiles (
        id,
        name,
        logo_url,
        x_handle
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ ok: false, error: 'Failed to load campaigns' });
  }

  const campaignIds = (campaigns || []).map((c: any) => c.id);
  const brandIds = (campaigns || []).map((c: any) => c.brand_id);

  const handleSet = new Set<string>();
  for (const campaign of campaigns || []) {
    const handle = campaign.brand_profiles?.x_handle?.replace('@', '').trim();
    if (!campaign.brand_profiles?.logo_url && handle) {
      handleSet.add(handle);
    }
  }

  const handles = Array.from(handleSet).slice(0, 15);
  const handleToImage: Record<string, string> = {};
  for (const handle of handles) {
    const userInfo = await taioGetUserInfo(handle);
    if (userInfo?.profileImageUrl) {
      handleToImage[handle] = userInfo.profileImageUrl;
    }
  }

  const { data: creatorRows } = await supabase
    .from('brand_campaign_creators')
    .select('campaign_id, status, username, profile_id')
    .in('campaign_id', campaignIds.length ? campaignIds : ['00000000-0000-0000-0000-000000000000'])
    .or(
      [
        user.profileId ? `profile_id.eq.${user.profileId}` : null,
        twitterUsername ? `username.eq.${twitterUsername}` : null,
      ]
        .filter(Boolean)
        .join(',')
    );

  const { data: memberRows } = await supabase
    .from('brand_members')
    .select('brand_id, profile_id, username')
    .in('brand_id', brandIds.length ? brandIds : ['00000000-0000-0000-0000-000000000000'])
    .or(
      [
        user.profileId ? `profile_id.eq.${user.profileId}` : null,
        twitterUsername ? `username.eq.${twitterUsername}` : null,
      ]
        .filter(Boolean)
        .join(',')
    );

  const { data: approvedRows } = await supabase
    .from('brand_campaign_creators')
    .select('campaign_id, status')
    .in('campaign_id', campaignIds.length ? campaignIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('status', 'approved');

  const approvedCountMap = (approvedRows || []).reduce<Record<string, number>>((acc, row: any) => {
    acc[row.campaign_id] = (acc[row.campaign_id] || 0) + 1;
    return acc;
  }, {});

  const creatorMap = (creatorRows || []).reduce<Record<string, any>>((acc, row: any) => {
    acc[row.campaign_id] = row;
    return acc;
  }, {});

  const memberSet = new Set((memberRows || []).map((m: any) => m.brand_id));

  const filtered = (campaigns || []).filter((c: any) => {
    const creatorStatus = creatorMap[c.id]?.status || null;
    if (creatorStatus) return true;
    return c.campaign_type === 'public';
  });

  const normalized = filtered.map((c: any) => ({
    id: c.id,
    brand_id: c.brand_id,
    name: c.name,
    pitch: c.pitch,
    objectives: c.objectives,
    campaign_type: c.campaign_type,
    status: c.status,
    languages: c.languages || [],
    start_at: c.start_at,
    end_at: c.end_at,
    brand: c.brand_profiles
      ? {
          id: c.brand_profiles.id,
          name: c.brand_profiles.name,
          logo_url: c.brand_profiles.logo_url,
          x_handle: c.brand_profiles.x_handle,
          x_profile_image_url:
            !c.brand_profiles.logo_url && c.brand_profiles.x_handle
              ? handleToImage[c.brand_profiles.x_handle.replace('@', '').trim()] || null
              : null,
        }
      : null,
    creatorStatus: creatorMap[c.id]?.status || null,
    isMember: memberSet.has(c.brand_id),
    approvedCount: approvedCountMap[c.id] || 0,
  }));

  return res.status(200).json({ ok: true, campaigns: normalized });
}
