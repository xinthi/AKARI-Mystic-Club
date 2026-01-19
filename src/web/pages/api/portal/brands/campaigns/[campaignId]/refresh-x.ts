/**
 * API Route: /api/portal/brands/campaigns/[campaignId]/refresh-x
 *
 * PATCH: Re-verify X submissions and refresh metrics
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { twitterApiGetTweetById } from '@/lib/twitterapi';
import { isSuperAdminServerSide } from '@/lib/server-auth';

type Response =
  | { ok: true; refreshed: number }
  | { ok: false; error: string };

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
    tweet?.data?.tweets?.[0],
    tweet?.data?.results?.[0],
    tweet?.tweets?.[0],
    tweet?.results?.[0],
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
      metrics?.repost_count ??
      metrics?.retweets ??
      metrics?.reposts ??
      data?.retweet_count ??
      data?.repost_count ??
      data?.retweets ??
      data?.reposts ??
      0
  );
  const viewCount = Number(
    metrics?.impression_count ??
      metrics?.views ??
      metrics?.view_count ??
      metrics?.viewCount ??
      data?.view_count ??
      data?.viewCount ??
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

function normalizeHandle(handle?: string | null): string | null {
  if (!handle) return null;
  return handle.replace(/^@+/, '').toLowerCase();
}

function containsWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'i');
  return re.test(haystack);
}

function extractObjectivePhrases(objectives?: string | null): string[] {
  if (!objectives) return [];
  return objectives
    .split(/[.\n;•-]/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 6);
}

function isTweetQualified(
  tweetText: string,
  brandName?: string | null,
  objectives?: string | null,
  handle?: string | null
): boolean {
  if (!tweetText) return false;
  const normalized = tweetText.toLowerCase();
  const brand = brandName ? brandName.toLowerCase() : null;
  const brandHandle = normalizeHandle(handle);
  const phrases = extractObjectivePhrases(objectives);
  if (brandHandle && normalized.includes(`@${brandHandle}`)) return true;
  if (brand && brand.length >= 4 && containsWord(normalized, brand)) return true;
  return phrases.some((phrase) => normalized.includes(phrase.toLowerCase()));
}

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
  if (req.method !== 'PATCH') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const campaignId = (req.query.campaignId ?? req.query.questId) as string | undefined;
  if (!campaignId) {
    return res.status(400).json({ ok: false, error: 'campaignId is required' });
  }

  const isSuperAdmin = await isSuperAdminServerSide(user.userId);
  if (!isSuperAdmin) {
    return res.status(403).json({ ok: false, error: 'superadmin_only' });
  }

  const { data: campaign } = await supabase
    .from('brand_campaigns')
    .select('id, brand_id, objectives, brand_profiles(name, x_handle)')
    .eq('id', campaignId)
    .maybeSingle();

  if (!campaign) {
    return res.status(404).json({ ok: false, error: 'Quest not found' });
  }

  await supabase
    .from('campaign_submissions')
    .update({ status: 'approved' })
    .eq('campaign_id', campaignId)
    .neq('platform', 'x')
    .eq('status', 'pending');

  const submissionsQuery = supabase
    .from('campaign_submissions')
    .select('id, creator_profile_id, post_url, x_tweet_id, platform')
    .eq('campaign_id', campaignId)
    .eq('platform', 'x');

  const { data: submissions } = await submissionsQuery;
  const rows = submissions || [];

  const { data: utmLinks } = await supabase
    .from('campaign_utm_links')
    .select('id, generated_url, brand_campaign_link_id, base_url')
    .eq('campaign_id', campaignId);

  let refreshed = 0;
  const brandRow = Array.isArray(campaign?.brand_profiles)
    ? campaign?.brand_profiles?.[0]
    : campaign?.brand_profiles;
  for (const row of rows) {
    const tweetId = row.x_tweet_id || extractTweetId(String(row.post_url || ''));
    if (!tweetId) continue;

    const tweet = await twitterApiGetTweetById(tweetId, String(row.post_url || ''));
    if (!tweet) {
      await supabase
        .from('campaign_submissions')
        .update({
          status: 'pending',
          rejected_reason: 'Awaiting X verification',
        })
        .eq('id', row.id);
      refreshed += 1;
      continue;
    }

    const creatorHandle = await getCreatorHandle(supabase, row.creator_profile_id, user.userId);
    const authorHandle = extractAuthorHandle(tweet);
    if (!creatorHandle || !authorHandle || creatorHandle !== authorHandle) {
      await supabase
        .from('campaign_submissions')
        .update({
          status: 'rejected',
          rejected_reason: 'Tweet not authored by creator',
        })
        .eq('id', row.id);
      refreshed += 1;
      continue;
    }

    const metrics = extractTweetMetrics(tweet);
    const engagementScore = metrics.likeCount + metrics.replyCount + metrics.repostCount;

    const urls = await expandTrackingUrls(extractTweetUrls(tweet));
    const match = findMatchingUtmLink(urls, utmLinks || []);

    const tweetText = extractTweetText(tweet);
    const qualified = isTweetQualified(tweetText, brandRow?.name, campaign?.objectives, brandRow?.x_handle);

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

  return res.status(200).json({ ok: true, refreshed });
}
