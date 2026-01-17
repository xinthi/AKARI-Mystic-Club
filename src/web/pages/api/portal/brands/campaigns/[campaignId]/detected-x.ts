/**
 * API Route: /api/portal/brands/campaigns/[campaignId]/detected-x
 *
 * GET: list detected X tweets for current creator within campaign window
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { resolveProfileId } from '@/lib/arc/resolveProfileId';

type Response =
  | { ok: true; tweets: any[] }
  | { ok: false; error: string };

async function getCreatorHandle(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  profileId: string,
  userId: string
): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', profileId)
    .maybeSingle();
  if (profile?.username) {
    return String(profile.username).replace(/^@+/, '').toLowerCase();
  }
  const { data: identity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', userId)
    .in('provider', ['x', 'twitter'])
    .maybeSingle();
  return identity?.username ? String(identity.username).replace(/^@+/, '').toLowerCase() : null;
}

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

  let profileId = user.profileId;
  if (!profileId) {
    profileId = await resolveProfileId(supabase, user.userId);
  }
  if (!profileId) {
    return res.status(403).json({ ok: false, error: 'Profile not found' });
  }

  const creatorHandle = await getCreatorHandle(supabase, profileId, user.userId);
  if (!creatorHandle) {
    return res.status(200).json({ ok: true, tweets: [] });
  }

  const { data: campaign } = await supabase
    .from('brand_campaigns')
    .select('start_at, end_at')
    .eq('id', campaignId)
    .maybeSingle();

  const { data: submitted } = await supabase
    .from('campaign_submissions')
    .select('x_tweet_id')
    .eq('campaign_id', campaignId)
    .eq('creator_profile_id', profileId)
    .eq('platform', 'x');

  const submittedIds = new Set((submitted || []).map((s: any) => s.x_tweet_id).filter(Boolean));

  let query = supabase
    .from('project_tweets')
    .select('tweet_id, tweet_url, text, likes, replies, retweets, created_at, author_handle, author_profile_image_url')
    .or(`author_handle.eq.${creatorHandle},author_handle.eq.@${creatorHandle}`)
    .order('created_at', { ascending: false })
    .limit(20);

  if (campaign?.start_at) {
    query = query.gte('created_at', campaign.start_at);
  }
  if (campaign?.end_at) {
    query = query.lte('created_at', campaign.end_at);
  }

  const { data: tweets } = await query;
  const filtered = (tweets || [])
    .filter((t: any) => !submittedIds.has(t.tweet_id))
    .slice(0, 10);

  return res.status(200).json({ ok: true, tweets: filtered });
}
