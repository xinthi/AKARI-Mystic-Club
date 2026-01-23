/**
 * API Route: /api/portal/brands/campaigns/[campaignId]/submit
 *
 * POST: Creator submits a post URL for a campaign
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { twitterApiGetTweetByIdDebug, twitterApiSearchTweetsDebug } from '@/lib/twitterapi';
import { resolveProfileId } from '@/lib/arc/resolveProfileId';
import { detectBrandAttribution, normalizeBrandAliases, scoreQuestPost } from '@/lib/arc/quest-scoring';

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

function extractUrlsFromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/https?:\/\/\S+/gi) || [];
  return matches.map((m) => m.replace(/[)\].,!?]+$/, ''));
}

async function fetchOpenGraphText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(6000) });
    if (!res.ok) return '';
    const html = await res.text();
    const extract = (prop: string) => {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i');
      const match = html.match(re);
      return match?.[1] || '';
    };
    const title = extract('og:title');
    const desc = extract('og:description');
    return [title, desc].filter(Boolean).join(' ').trim();
  } catch {
    return '';
  }
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
  let eligible = false;
  let brand_attribution = false;
  let content_text: string | null = null;
  let alignment_score: number | null = null;
  let compliance_score: number | null = null;
  let clarity_score: number | null = null;
  let safety_score: number | null = null;
  let post_quality_score: number | null = null;
  let post_final_score: number | null = null;
  let score_reason_json: any = null;

  let like_count: number | null = null;
  let reply_count: number | null = null;
  let repost_count: number | null = null;
  let view_count: number | null = null;
  let engagement_score: number | null = null;
  let twitter_fetch_error: string | null = null;
  let twitter_fetch_at: string | null = null;
  let qualified = false;
  let qualification_reason: string | null = null;

  if (platformLower === 'x') {
    const tweetId = extractTweetId(String(postUrl));
    if (!tweetId) {
      status = 'rejected';
      rejected_reason = 'Tweet ID not found';
    } else {
      const creatorHandle = await getCreatorHandle(supabase, profileId, user.userId);
      const tweetResult = await twitterApiGetTweetByIdDebug(tweetId, String(postUrl));
      let tweet = tweetResult.data;
      const searchFallback = !tweet
        ? await findTweetViaSearch(tweetId, String(postUrl), creatorHandle)
        : { tweet: null, errors: [] };
      if (!tweet && searchFallback.tweet) {
        tweet = searchFallback.tweet;
      }
      const combinedErrors = [
        ...tweetResult.errors,
        ...(searchFallback.errors || []),
      ];
      twitter_fetch_error = tweet ? null : (combinedErrors.slice(0, 6).join(' | ') || null);
      twitter_fetch_at = new Date().toISOString();
      if (!tweet) {
        // Keep pending so creators can refresh later instead of showing "not found"
        status = 'pending';
        rejected_reason = 'Awaiting X verification';
      } else {
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
          content_text = tweetText;
          const aliases = normalizeBrandAliases({
            brandName: brandRow?.name,
            brandHandle: brandRow?.x_handle,
          });
          brand_attribution = detectBrandAttribution(tweetText, aliases, brandRow?.x_handle);

          const { data: utmLinks } = await supabase
            .from('campaign_utm_links')
            .select('id, generated_url, brand_campaign_link_id, base_url')
            .eq('campaign_id', campaignId)
            .eq('creator_profile_id', profileId);

          const replyUrls = await findReplyUrls(tweetId, creatorHandle);
          const urls = await expandTrackingUrls([...extractTweetUrls(tweet), ...replyUrls]);
          const match = findMatchingUtmLink(urls, utmLinks || []);
          used_campaign_link = match.matched;
          matched_utm_link_id = match.matchedId;

          eligible = used_campaign_link && brand_attribution;
          if (eligible) {
            const scores = scoreQuestPost({
              text: tweetText,
              objectives: campaign?.objectives || null,
              usedCampaignLink: used_campaign_link,
              brandAttribution: brand_attribution,
              platform: 'x',
              likes: like_count,
              replies: reply_count,
              reposts: repost_count,
            });
            alignment_score = scores.alignmentScore;
            compliance_score = scores.complianceScore;
            clarity_score = scores.clarityScore;
            safety_score = scores.safetyScore;
            post_quality_score = scores.postQualityScore;
            post_final_score = scores.postFinalScore;
            score_reason_json = scores.reason;
            qualified = post_quality_score >= 50;
            if (!qualified) {
              qualification_reason = 'Content does not meet quest standards';
            }
          } else {
            qualified = false;
            qualification_reason = used_campaign_link ? 'Missing brand mention' : 'Tracked link not detected';
          }
        }
      }
    }
  } else {
    status = 'approved';
    const brandRow = Array.isArray(campaign?.brand_profiles)
      ? campaign?.brand_profiles?.[0]
      : campaign?.brand_profiles;
    const aliases = normalizeBrandAliases({
      brandName: brandRow?.name,
      brandHandle: brandRow?.x_handle,
    });
    const rawContentText = req.body?.contentText ? String(req.body.contentText) : '';
    const ogText = !rawContentText && postUrl ? await fetchOpenGraphText(String(postUrl)) : '';
    content_text = rawContentText || ogText || null;
    brand_attribution = content_text ? detectBrandAttribution(content_text, aliases, brandRow?.x_handle) : false;

    const { data: utmLinks } = await supabase
      .from('campaign_utm_links')
      .select('id, generated_url, brand_campaign_link_id, base_url')
      .eq('campaign_id', campaignId)
      .eq('creator_profile_id', profileId);
    const urls = [String(postUrl), ...extractUrlsFromText(content_text || '')];
    const match = findMatchingUtmLink(urls, utmLinks || []);
    used_campaign_link = match.matched;
    matched_utm_link_id = match.matchedId;
    eligible = used_campaign_link && brand_attribution;

    if (eligible) {
      const scores = scoreQuestPost({
        text: content_text || '',
        objectives: campaign?.objectives || null,
        usedCampaignLink: used_campaign_link,
        brandAttribution: brand_attribution,
        platform: platformLower,
      });
      alignment_score = scores.alignmentScore;
      compliance_score = scores.complianceScore;
      clarity_score = scores.clarityScore;
      safety_score = scores.safetyScore;
      post_quality_score = scores.postQualityScore;
      post_final_score = scores.postFinalScore;
      score_reason_json = scores.reason;
      qualified = post_quality_score >= 50;
      if (!qualified) {
        qualification_reason = 'Content does not meet quest standards';
      }
    } else {
      qualified = false;
      qualification_reason = used_campaign_link ? 'Missing brand mention' : 'Tracked link not detected';
    }
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
      eligible,
      brand_attribution,
      content_text,
      alignment_score,
      compliance_score,
      clarity_score,
      safety_score,
      post_quality_score,
      post_final_score,
      score_reason_json,
      qualified,
      qualification_reason,
      twitter_fetch_error,
      twitter_fetch_at,
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
