/**
 * Cron: /api/portal/cron/arc-refresh-x
 *
 * Refresh X submissions and metrics for active quests.
 * Requires CRON_SECRET.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { twitterApiGetTweetById } from '@/lib/twitterapi';

type Response =
  | { ok: true; refreshed: number }
  | { ok: false; error: string };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function createServiceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function validateCronSecret(req: NextApiRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = req.headers.authorization;
  const authSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  const providedSecret =
    authSecret ||
    (req.headers['x-cron-secret'] as string | undefined) ||
    (req.query.secret as string | undefined) ||
    (req.query.token as string | undefined);
  return providedSecret === cronSecret;
}

function extractTweetId(url: string): string | null {
  const match = url.match(/status\/(\d+)/i);
  return match?.[1] || null;
}

function normalizeTweetData(tweet: any): any {
  const candidates = [
    tweet,
    tweet?.data,
    tweet?.data?.data,
    tweet?.data?.tweet,
    tweet?.data?.result,
    tweet?.tweet,
    tweet?.result,
  ];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    if (
      candidate.public_metrics ||
      candidate.metrics ||
      candidate.publicMetrics ||
      candidate.favorite_count ||
      candidate.reply_count ||
      candidate.retweet_count ||
      candidate.view_count ||
      candidate.views ||
      candidate.likes ||
      candidate.entities ||
      candidate.urls ||
      candidate.author ||
      candidate.user ||
      candidate.author_details ||
      candidate.author_username ||
      candidate.userName ||
      candidate.username
    ) {
      return candidate;
    }
  }
  return tweet?.data || tweet;
}

function extractAuthorHandle(tweet: any): string | null {
  const data = normalizeTweetData(tweet);
  const author = data?.author || data?.user || data?.author_details || {};
  const handle =
    author?.userName ||
    author?.username ||
    author?.screen_name ||
    data?.author_username ||
    data?.userName ||
    data?.username ||
    null;
  return handle ? String(handle).replace(/^@+/, '').toLowerCase() : null;
}

function extractTweetUrls(tweet: any): string[] {
  const data = normalizeTweetData(tweet);
  const entities = data?.entities || {};
  const urls = entities?.urls || data?.urls || [];
  if (Array.isArray(urls)) {
    return urls
      .map((u: any) => u?.expanded_url || u?.expandedUrl || u?.url || u?.display_url || u?.displayUrl)
      .filter(Boolean)
      .map((u: any) => String(u));
  }
  return [];
}

async function expandTrackingUrls(urls: string[]): Promise<string[]> {
  const expanded: string[] = [];
  for (const raw of urls) {
    expanded.push(raw);
    try {
      const parsed = new URL(raw);
      if (parsed.hostname.endsWith('t.co')) {
        let res = await fetch(raw, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(6000) });
        if (!res.ok) {
          res = await fetch(raw, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(6000) });
        }
        if (res.url) expanded.push(res.url);
      }
    } catch {
      // ignore parse errors
    }
  }
  return Array.from(new Set(expanded));
}

function extractTweetMetrics(tweet: any): {
  likeCount: number;
  replyCount: number;
  repostCount: number;
  viewCount: number;
} {
  const data = normalizeTweetData(tweet);
  const metrics = data?.public_metrics || data?.metrics || data?.publicMetrics || null;

  const likeCount = Number(
    metrics?.like_count ??
      metrics?.likes ??
      data?.favorite_count ??
      data?.likes ??
      0
  );
  const replyCount = Number(
    metrics?.reply_count ??
      metrics?.replies ??
      data?.reply_count ??
      data?.replies ??
      0
  );
  const repostCount = Number(
    metrics?.retweet_count ??
      metrics?.retweets ??
      data?.retweet_count ??
      data?.retweets ??
      0
  );
  const viewCount = Number(
    metrics?.impression_count ??
      metrics?.views ??
      data?.view_count ??
      data?.views ??
      0
  );

  return { likeCount, replyCount, repostCount, viewCount };
}

function extractTweetText(tweet: any): string {
  const data = normalizeTweetData(tweet);
  return (
    data?.full_text ||
    data?.fullText ||
    data?.text ||
    data?.content ||
    data?.body ||
    ''
  ).toString();
}

function buildQualificationKeywords(brandName?: string | null, objectives?: string | null, handle?: string | null): string[] {
  const raw = [brandName, objectives, handle ? `@${handle}` : null]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const words = raw
    .replace(/[^a-z0-9@ ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  return Array.from(new Set(words));
}

function isTweetQualified(tweetText: string, keywords: string[]): boolean {
  if (!tweetText || keywords.length === 0) return false;
  const normalized = tweetText.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function findMatchingUtmLink(
  urls: string[],
  utmLinks: Array<{ id: string; generated_url: string; brand_campaign_link_id: string; base_url: string }>
): { matched: boolean; matchedId: string | null } {
  const normalizedUrls = urls.map((u) => u.toLowerCase());
  const redirectPath = '/api/portal/utm/redirect';

  for (const link of utmLinks) {
    const generated = link.generated_url?.toLowerCase() || '';
    const linkId = link.brand_campaign_link_id;
    if (generated && normalizedUrls.some((u) => u.includes(generated))) {
      return { matched: true, matchedId: link.id };
    }
    for (const raw of urls) {
      try {
        const parsed = new URL(raw);
        const hasRedirect = parsed.pathname.includes(redirectPath);
        const content = parsed.searchParams.get('utm_content') || parsed.searchParams.get('linkId');
        const utmLinkId = parsed.searchParams.get('utmLinkId');
        const campaign = parsed.searchParams.get('utm_campaign') || parsed.searchParams.get('campaignId');
        if (utmLinkId && utmLinkId === link.id) {
          return { matched: true, matchedId: link.id };
        }
        if (hasRedirect && content && content === linkId) {
          return { matched: true, matchedId: link.id };
        }
        if (campaign && content && content === linkId) {
          return { matched: true, matchedId: link.id };
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  return { matched: false, matchedId: null };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!validateCronSecret(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const supabase = createServiceClient();

  const { data: campaigns } = await supabase
    .from('brand_campaigns')
    .select('id, start_at, end_at, launch_status, status, objectives, brand_profiles(name, x_handle)');

  const now = Date.now();
  const activeCampaigns = (campaigns || []).filter((c: any) => {
    if (c.launch_status && c.launch_status !== 'approved') return false;
    if (c.status && c.status !== 'active') return false;
    const start = c.start_at ? new Date(c.start_at).getTime() : null;
    const end = c.end_at ? new Date(c.end_at).getTime() : null;
    if (!start || !end) return false;
    return start <= now && end >= now;
  });

  let refreshed = 0;

  for (const campaign of activeCampaigns) {
    const campaignId = campaign.id;
    await supabase
      .from('campaign_submissions')
      .update({ status: 'approved' })
      .eq('campaign_id', campaignId)
      .neq('platform', 'x')
      .eq('status', 'pending');

    const { data: submissions } = await supabase
      .from('campaign_submissions')
      .select('id, creator_profile_id, post_url, x_tweet_id')
      .eq('campaign_id', campaignId)
      .eq('platform', 'x');

    const { data: utmLinks } = await supabase
      .from('campaign_utm_links')
      .select('id, generated_url, brand_campaign_link_id, base_url')
      .eq('campaign_id', campaignId);

    const brandRow = Array.isArray(campaign?.brand_profiles)
      ? campaign?.brand_profiles?.[0]
      : campaign?.brand_profiles;
    const qualificationKeywords = buildQualificationKeywords(brandRow?.name, campaign?.objectives, brandRow?.x_handle);

    const rows = submissions || [];
    for (const row of rows) {
      const tweetId = row.x_tweet_id || extractTweetId(String(row.post_url || ''));
      if (!tweetId) continue;

      const tweet = await twitterApiGetTweetById(tweetId);
      if (!tweet) {
        await supabase
          .from('campaign_submissions')
          .update({ status: 'pending', rejected_reason: null })
          .eq('id', row.id);
        refreshed += 1;
        continue;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', row.creator_profile_id)
        .maybeSingle();

      const creatorHandle = profile?.username ? String(profile.username).replace(/^@+/, '').toLowerCase() : null;
      const authorHandle = extractAuthorHandle(tweet);
      if (!creatorHandle || !authorHandle || creatorHandle !== authorHandle) {
        await supabase
          .from('campaign_submissions')
          .update({ status: 'rejected', rejected_reason: 'Tweet not authored by creator' })
          .eq('id', row.id);
        refreshed += 1;
        continue;
      }

      const metrics = extractTweetMetrics(tweet);
      const engagementScore =
        metrics.likeCount + metrics.replyCount + metrics.repostCount + Math.round(metrics.viewCount / 100);

      const urls = await expandTrackingUrls(extractTweetUrls(tweet));
      const match = findMatchingUtmLink(urls, utmLinks || []);

      const tweetText = extractTweetText(tweet);
      const qualified = isTweetQualified(tweetText, qualificationKeywords);

      await supabase
        .from('campaign_submissions')
        .update({
          status: 'approved',
          verified_at: new Date().toISOString(),
          x_tweet_id: tweetId,
          rejected_reason: null,
          used_campaign_link: match.matched,
          matched_utm_link_id: match.matchedId,
          qualified,
          qualification_reason: qualified ? null : 'Content does not match brand or objectives',
          like_count: metrics.likeCount,
          reply_count: metrics.replyCount,
          repost_count: metrics.repostCount,
          view_count: metrics.viewCount,
          engagement_score: engagementScore,
        })
        .eq('id', row.id);

      refreshed += 1;
    }
  }

  return res.status(200).json({ ok: true, refreshed });
}
