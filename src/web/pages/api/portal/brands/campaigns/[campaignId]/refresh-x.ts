/**
 * API Route: /api/portal/brands/campaigns/[campaignId]/refresh-x
 *
 * PATCH: Re-verify X submissions and refresh metrics
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { twitterApiGetTweetByIdDebug, twitterApiSearchTweetsDebug } from '@/lib/twitterapi';
import { isSuperAdminServerSide } from '@/lib/server-auth';
import { resolveProfileId } from '@/lib/arc/resolveProfileId';
import { detectBrandAttribution, normalizeBrandAliases, scoreQuestPost } from '@/lib/arc/quest-scoring';

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

function extractSearchTweets(payload: any): any[] {
  const data = payload?.data || payload;
  const candidates = [
    data?.tweets,
    data?.results,
    data?.items,
    data?.data,
    data,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate?.tweets && Array.isArray(candidate.tweets)) return candidate.tweets;
    if (candidate?.results && Array.isArray(candidate.results)) return candidate.results;
    if (candidate?.items && Array.isArray(candidate.items)) return candidate.items;
  }
  return [];
}

function cleanTweetUrl(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return raw;
  }
}

function buildUrlVariants(url: string | null): string[] {
  if (!url) return [];
  const variants = new Set<string>();
  variants.add(url);
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    variants.add(`https://x.com${path}`);
    variants.add(`https://twitter.com${path}`);
  } catch {
    // ignore
  }
  return Array.from(variants);
}

function extractTweetIdFromPayload(tweet: any): string | null {
  const data = tweet?.data || tweet;
  const id =
    data?.id ||
    data?.tweet_id ||
    data?.rest_id ||
    tweet?.id ||
    tweet?.tweet_id ||
    tweet?.rest_id;
  return id ? String(id) : null;
}

function pickTweetFromSearch(tweets: any[], tweetId: string): any | null {
  for (const t of tweets) {
    const id = extractTweetIdFromPayload(t);
    if (id === tweetId) return t;
    const text = extractTweetText(t);
    if (text && text.includes(tweetId)) return t;
  }
  return tweets[0] || null;
}

async function findTweetViaSearch(tweetId: string, tweetUrl: string | null, creatorHandle: string | null) {
  const queries: string[] = [];
  const cleanUrl = cleanTweetUrl(tweetUrl);
  for (const url of buildUrlVariants(cleanUrl)) {
    queries.push(`url:"${url}"`);
    queries.push(`url:${url}`);
  }
  queries.push(`conversation_id:${tweetId}`);
  if (creatorHandle) {
    queries.push(`from:${creatorHandle} ${tweetId}`);
    for (const url of buildUrlVariants(cleanUrl)) {
      queries.push(`from:${creatorHandle} url:${url}`);
    }
    queries.push(`from:${creatorHandle}`);
  }

  const errors: string[] = [];
  for (const query of queries) {
    const searchResult = await twitterApiSearchTweetsDebug(query, 25);
    if (searchResult.errors?.length) {
      errors.push(...searchResult.errors);
    }
    const tweets = extractSearchTweets(searchResult.data);
    const found = pickTweetFromSearch(tweets, tweetId);
    if (found) return { tweet: found, errors };
  }

  errors.push('X API search returned no match');
  return { tweet: null, errors };
}

async function findReplyUrls(tweetId: string, creatorHandle: string | null): Promise<string[]> {
  if (!creatorHandle) return [];
  const query = `conversation_id:${tweetId} from:${creatorHandle}`;
  const searchResult = await twitterApiSearchTweetsDebug(query, 25);
  const tweets = extractSearchTweets(searchResult.data);
  const urls: string[] = [];
  for (const t of tweets) {
    urls.push(...extractTweetUrls(t));
  }
  return urls;
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
  let scopeProfileId = user.profileId || null;
  if (!isSuperAdmin && !scopeProfileId) {
    scopeProfileId = await resolveProfileId(supabase, user.userId);
  }
  if (!isSuperAdmin && !scopeProfileId) {
    return res.status(403).json({ ok: false, error: 'profile_not_found' });
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
  if (!isSuperAdmin && scopeProfileId) {
    submissionsQuery.eq('creator_profile_id', scopeProfileId);
  }

  const { data: submissions } = await submissionsQuery;
  const rows = submissions || [];

  const utmLinksQuery = supabase
    .from('campaign_utm_links')
    .select('id, generated_url, brand_campaign_link_id, base_url')
    .eq('campaign_id', campaignId);
  if (!isSuperAdmin && scopeProfileId) {
    utmLinksQuery.eq('creator_profile_id', scopeProfileId);
  }
  const { data: utmLinks } = await utmLinksQuery;

  let refreshed = 0;
  const brandRow = Array.isArray(campaign?.brand_profiles)
    ? campaign?.brand_profiles?.[0]
    : campaign?.brand_profiles;
  const brandAliases = normalizeBrandAliases({
    brandName: brandRow?.name,
    brandHandle: brandRow?.x_handle,
  });
  for (const row of rows) {
    const tweetId = row.x_tweet_id || extractTweetId(String(row.post_url || ''));
    if (!tweetId) continue;

    const creatorHandle = await getCreatorHandle(supabase, row.creator_profile_id, user.userId);
    const tweetResult = await twitterApiGetTweetByIdDebug(tweetId, String(row.post_url || ''));
    let tweet = tweetResult.data;
    const searchFallback = !tweet
      ? await findTweetViaSearch(tweetId, String(row.post_url || ''), creatorHandle)
      : { tweet: null, errors: [] };
    if (!tweet && searchFallback.tweet) {
      tweet = searchFallback.tweet;
    }
    const combinedErrors = [
      ...tweetResult.errors,
      ...(searchFallback.errors || []),
    ];
    const fetchError = combinedErrors.slice(0, 6).join(' | ') || null;
    if (!tweet) {
      const replyUrls = await findReplyUrls(tweetId, creatorHandle);
      const urls = await expandTrackingUrls(replyUrls);
      const match = findMatchingUtmLink(urls, utmLinks || []);
      await supabase
        .from('campaign_submissions')
        .update({
          status: 'pending',
          rejected_reason: 'Awaiting X verification',
          used_campaign_link: match.matched,
          matched_utm_link_id: match.matchedId,
          eligible: false,
          brand_attribution: false,
          post_quality_score: 0,
          post_final_score: 0,
          alignment_score: 0,
          compliance_score: 0,
          clarity_score: 0,
          safety_score: 0,
          score_reason_json: null,
          twitter_fetch_error: fetchError,
          twitter_fetch_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      refreshed += 1;
      continue;
    }

    const authorHandle = extractAuthorHandle(tweet);
    if (!creatorHandle || !authorHandle || creatorHandle !== authorHandle) {
      await supabase
        .from('campaign_submissions')
        .update({
          status: 'rejected',
          rejected_reason: 'Tweet not authored by creator',
          twitter_fetch_error: 'author_mismatch',
          twitter_fetch_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      refreshed += 1;
      continue;
    }

    const metrics = extractTweetMetrics(tweet);
    const engagementScore = metrics.likeCount + metrics.replyCount + metrics.repostCount;

    const replyUrls = await findReplyUrls(tweetId, creatorHandle);
    const urls = await expandTrackingUrls([...extractTweetUrls(tweet), ...replyUrls]);
    const match = findMatchingUtmLink(urls, utmLinks || []);

    const tweetText = extractTweetText(tweet);
    const brandAttribution = detectBrandAttribution(tweetText, brandAliases, brandRow?.x_handle);
    const eligible = match.matched && brandAttribution;
    const scores = eligible
      ? scoreQuestPost({
          text: tweetText,
          objectives: campaign?.objectives || null,
          usedCampaignLink: match.matched,
          brandAttribution,
          platform: 'x',
          likes: metrics.likeCount,
          replies: metrics.replyCount,
          reposts: metrics.repostCount,
        })
      : null;
    const qualified = eligible && (scores?.postQualityScore || 0) >= 50;

    await supabase
      .from('campaign_submissions')
      .update({
        status: 'approved',
        verified_at: new Date().toISOString(),
        x_tweet_id: tweetId,
        rejected_reason: null,
        used_campaign_link: match.matched,
        matched_utm_link_id: match.matchedId,
        content_text: tweetText,
        eligible,
        brand_attribution: brandAttribution,
        post_quality_score: scores?.postQualityScore || 0,
        post_final_score: scores?.postFinalScore || 0,
        alignment_score: scores?.alignmentScore || 0,
        compliance_score: scores?.complianceScore || 0,
        clarity_score: scores?.clarityScore || 0,
        safety_score: scores?.safetyScore || 0,
        score_reason_json: scores?.reason || null,
        qualified,
        qualification_reason: qualified ? null : (eligible ? 'Content does not meet quest standards' : 'Missing brand mention or tracked link'),
        twitter_fetch_error: null,
        twitter_fetch_at: new Date().toISOString(),
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
