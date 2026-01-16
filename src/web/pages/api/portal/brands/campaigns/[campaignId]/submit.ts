/**
 * API Route: /api/portal/brands/campaigns/[campaignId]/submit
 *
 * POST: Creator submits a post URL for a campaign
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { twitterApiGetTweetById } from '@/lib/twitterapi';

type Response =
  | { ok: true }
  | { ok: false; error: string };

function extractTweetId(url: string): string | null {
  const match = url.match(/status\/(\d+)/i);
  return match?.[1] || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const campaignId = (req.query.campaignId ?? req.query.questId) as string | undefined;
  const { platform, postUrl } = req.body || {};

  if (!campaignId || !platform || !postUrl) {
    return res.status(400).json({ ok: false, error: 'campaignId, platform, and postUrl are required' });
  }

  if (!user.profileId) {
    return res.status(403).json({ ok: false, error: 'Profile not found' });
  }

  const { data: campaign } = await supabase
    .from('brand_campaigns')
    .select('end_at')
    .eq('id', campaignId)
    .maybeSingle();

  if (campaign?.end_at) {
    const cutoff = new Date(campaign.end_at).getTime() - 24 * 60 * 60 * 1000;
    if (Date.now() > cutoff) {
      return res.status(400).json({ ok: false, error: 'Submissions must be at least 24 hours before campaign end' });
    }
  }

  let like_count: number | null = null;
  let reply_count: number | null = null;
  let repost_count: number | null = null;
  let view_count: number | null = null;
  let engagement_score: number | null = null;

  if (String(platform).toLowerCase() === 'x') {
    const tweetId = extractTweetId(String(postUrl));
    if (tweetId) {
      const tweet = await twitterApiGetTweetById(tweetId);
      const metrics = tweet?.data?.public_metrics || tweet?.public_metrics || tweet?.metrics || null;
      if (metrics) {
        like_count = Number(metrics.like_count ?? metrics.likes ?? 0);
        reply_count = Number(metrics.reply_count ?? metrics.replies ?? 0);
        repost_count = Number(metrics.retweet_count ?? metrics.retweets ?? 0);
        view_count = Number(metrics.impression_count ?? metrics.views ?? 0);
        engagement_score = like_count + reply_count + repost_count + Math.round(view_count / 100);
      }
    }
  }

  const { error } = await supabase
    .from('campaign_submissions')
    .insert({
      campaign_id: campaignId,
      creator_profile_id: user.profileId,
      platform: String(platform),
      post_url: String(postUrl),
      status: 'pending',
      like_count,
      reply_count,
      repost_count,
      view_count,
      engagement_score,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return res.status(500).json({ ok: false, error: 'Failed to submit' });
  }

  return res.status(200).json({ ok: true });
}
