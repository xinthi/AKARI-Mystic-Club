/**
 * API Route: /api/portal/brands/campaigns/[campaignId]/submit
 *
 * POST: Creator submits a post URL for a campaign
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { twitterApiGetTweetById } from '@/lib/twitterapi';
import { resolveProfileId } from '@/lib/arc/resolveProfileId';

type Response =
  | { ok: true }
  | { ok: false; error: string };

function extractTweetId(url: string): string | null {
  const match = url.match(/status\/(\d+)/i);
  return match?.[1] || null;
}

function normalizeXUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return trimmed.replace(/^https?:\/\/twitter\.com\//i, 'https://x.com/');
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
  const metrics =
    data?.public_metrics ||
    data?.metrics ||
    data?.publicMetrics ||
    null;

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

  let profileId = user.profileId;
  if (!profileId) {
    profileId = await resolveProfileId(supabase, user.userId);
  }
  if (!profileId) {
    return res.status(403).json({ ok: false, error: 'Profile not found' });
  }

  const { data: campaign } = await supabase
    .from('brand_campaigns')
    .select('end_at, objectives, brand_id, brand_profiles(name, x_handle)')
    .eq('id', campaignId)
    .maybeSingle();

  if (campaign?.end_at) {
    const cutoff = new Date(campaign.end_at).getTime() - 24 * 60 * 60 * 1000;
    if (Date.now() > cutoff) {
      return res.status(400).json({ ok: false, error: 'Submissions must be at least 24 hours before campaign end' });
    }
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from('campaign_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('creator_profile_id', profileId)
    .gte('submitted_at', weekAgo);
  if ((recentCount || 0) >= 5) {
    return res.status(400).json({ ok: false, error: 'Weekly submission limit reached (5 per 7 days).' });
  }

  const platformLower = String(platform).toLowerCase();
  let status: 'pending' | 'approved' | 'rejected' | 'verified' = 'pending';
  let rejected_reason: string | null = null;
  let verified_at: string | null = null;
  let x_tweet_id: string | null = null;
  let used_campaign_link = false;
  let matched_utm_link_id: string | null = null;

  let like_count: number | null = null;
  let reply_count: number | null = null;
  let repost_count: number | null = null;
  let view_count: number | null = null;
  let engagement_score: number | null = null;
  let qualified = false;
  let qualification_reason: string | null = null;

  if (platformLower === 'x') {
    const tweetId = extractTweetId(String(postUrl));
    if (!tweetId) {
      status = 'rejected';
      rejected_reason = 'Tweet ID not found';
    } else {
      const tweet = await twitterApiGetTweetById(tweetId, String(postUrl));
      if (!tweet) {
        // Keep pending so creators can refresh later instead of showing "not found"
        status = 'pending';
        rejected_reason = 'Awaiting X verification';
      } else {
        const creatorHandle = await getCreatorHandle(supabase, profileId, user.userId);
        const authorHandle = extractAuthorHandle(tweet);
        if (!creatorHandle || !authorHandle || creatorHandle !== authorHandle) {
          status = 'rejected';
          rejected_reason = 'Tweet not authored by creator';
        } else {
          status = 'verified';
          verified_at = new Date().toISOString();
          x_tweet_id = tweetId;
          const metrics = extractTweetMetrics(tweet);
          like_count = metrics.likeCount;
          reply_count = metrics.replyCount;
          repost_count = metrics.repostCount;
          view_count = metrics.viewCount;
          engagement_score = like_count + reply_count + repost_count;

          const brandRow = Array.isArray(campaign?.brand_profiles)
            ? campaign?.brand_profiles?.[0]
            : campaign?.brand_profiles;
          const tweetText = extractTweetText(tweet);
          qualified = isTweetQualified(tweetText, brandRow?.name, campaign?.objectives, brandRow?.x_handle);
          if (!qualified) {
            qualification_reason = 'Content does not match brand or objectives';
          }

          const { data: utmLinks } = await supabase
            .from('campaign_utm_links')
            .select('id, generated_url, brand_campaign_link_id, base_url')
            .eq('campaign_id', campaignId)
            .eq('creator_profile_id', profileId);

          const urls = await expandTrackingUrls(extractTweetUrls(tweet));
          const match = findMatchingUtmLink(urls, utmLinks || []);
          used_campaign_link = match.matched;
          matched_utm_link_id = match.matchedId;
        }
      }
    }
  } else {
    status = 'approved';
  }

  const { error } = await supabase
    .from('campaign_submissions')
    .insert({
      campaign_id: campaignId,
      creator_profile_id: profileId,
      platform: String(platform),
      post_url: platformLower === 'x' ? normalizeXUrl(String(postUrl)) : String(postUrl),
      status: status === 'verified' ? 'approved' : status,
      x_tweet_id,
      verified_at,
      rejected_reason,
      used_campaign_link,
      matched_utm_link_id,
      qualified,
      qualification_reason,
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
