/**
 * API Route: GET /api/portal/sentiment/[slug]/analytics
 * 
 * Returns Twitter-style analytics for a project:
 * - Daily engagement volume (likes + retweets*2 + replies)
 * - Daily engagement rate
 * - Followers over time
 * - Tweet breakdown
 * - Summary statistics
 * 
 * Requires markets.analytics OR deep.analytics.addon permission.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createPortalClient, getProjectBySlug, fetchProfileImagesForHandles, getBestProfileImage } from '@/lib/portal/supabase';
import { can, FEATURE_KEYS } from '@/lib/permissions';

// =============================================================================
// TYPES
// =============================================================================

interface DailyEngagement {
  date: string;
  likes: number;
  retweets: number;
  replies: number;
  totalEngagement: number;
  tweetCount: number;
  engagementRate: number;
}

interface FollowerDataPoint {
  date: string;
  followers: number;
  change: number;
}

interface TweetBreakdown {
  tweetId: string;
  createdAt: string;
  authorHandle: string;
  authorName: string;
  authorProfileImageUrl: string | null;
  text: string;
  likes: number;
  retweets: number;
  replies: number;
  engagement: number;
  sentimentScore: number | null;
  isOfficial: boolean;
  tweetUrl: string;
}

interface AnalyticsSummary {
  totalEngagements: number;
  avgEngagementRate: number;
  tweetsCount: number;
  followerChange: number;
  tweetVelocity: number; // tweets per day
  avgSentiment: number;
  topTweetEngagement: number;
  officialTweetsCount: number;
  mentionsCount: number;
}

interface AnalyticsResponse {
  ok: true;
  window: '7d' | '30d';
  dailyEngagement: DailyEngagement[];
  followersOverTime: FollowerDataPoint[];
  tweetBreakdown: TweetBreakdown[];
  summary: AnalyticsSummary;
}

interface ErrorResponse {
  ok: false;
  error: string;
}

// =============================================================================
// HELPERS
// =============================================================================

// Get Supabase admin client for auth
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Parse session cookie
function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

// Get user from session
async function getUserFromSession(req: NextApiRequest) {
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return null;
  }

  try {
    const supabase = getSupabaseAdmin();

    // Find session
    const { data: session, error: sessionError } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      return null;
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      return null;
    }

    // Get user info
    const { data: user, error: userError } = await supabase
      .from('akari_users')
      .select('id, display_name, avatar_url, is_active')
      .eq('id', session.user_id)
      .single();

    if (userError || !user || !user.is_active) {
      return null;
    }

    // Get user roles
    const { data: roles } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', user.id);

    // Get feature grants
    const { data: grants } = await supabase
      .from('akari_user_feature_grants')
      .select('id, feature_key, starts_at, ends_at, discount_percent, discount_note')
      .eq('user_id', user.id);

    return {
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      roles: roles?.map(r => r.role) || ['user'],
      featureGrants: (grants || []).map((g: any) => ({
        id: g.id,
        featureKey: g.feature_key,
        startsAt: g.starts_at ? new Date(g.starts_at) : null,
        endsAt: g.ends_at ? new Date(g.ends_at) : null,
        discountPercent: g.discount_percent != null ? Number(g.discount_percent) : 0,
        discountNote: g.discount_note || null,
      })),
    };
  } catch (error) {
    console.error('[Analytics] Error getting user:', error);
    return null;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnalyticsResponse | ErrorResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { slug, window: windowParam } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ ok: false, error: 'Project slug is required' });
  }

  const window = windowParam === '7d' ? '7d' : '30d';
  const daysBack = window === '7d' ? 7 : 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  const startDateStr = startDate.toISOString().split('T')[0];

  try {
    // Authenticate user
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    // Check analytics permission (markets.analytics OR deep.analytics.addon)
    const akariUser = {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      realRoles: user.roles,
      effectiveRoles: user.roles,
      featureGrants: user.featureGrants,
      isLoggedIn: true,
      viewAsRole: null,
      xUsername: null,
      personaType: 'individual' as const,
      personaTag: null,
      telegramConnected: false,
    };

    const hasAnalyticsAccess = can(akariUser, 'markets.analytics') || can(akariUser, FEATURE_KEYS.DeepAnalyticsAddon);
    if (!hasAnalyticsAccess) {
      return res.status(403).json({ ok: false, error: 'Analytics access required' });
    }

    const supabase = createPortalClient();

    // Get project
    const project = await getProjectBySlug(supabase, slug);
    if (!project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    // Fetch tweets for the window period
    const { data: tweets, error: tweetsError } = await supabase
      .from('project_tweets')
      .select('*')
      .eq('project_id', project.id)
      .gte('created_at', startDateStr)
      .order('created_at', { ascending: false });

    if (tweetsError) {
      console.error('[Analytics] Tweets error:', tweetsError);
    }

    const tweetData = tweets || [];

    // Fetch metrics for followers over time
    const { data: metrics, error: metricsError } = await supabase
      .from('metrics_daily')
      .select('date, followers, sentiment_score, tweet_count')
      .eq('project_id', project.id)
      .gte('date', startDateStr)
      .order('date', { ascending: true });

    if (metricsError) {
      console.error('[Analytics] Metrics error:', metricsError);
    }

    const metricsData = metrics || [];

    // ==========================================================================
    // Calculate Daily Engagement
    // ==========================================================================
    const engagementByDate = new Map<string, { likes: number; retweets: number; replies: number; count: number }>();

    tweetData.forEach((t: any) => {
      const date = (t.created_at || '').split('T')[0];
      if (!date) return;

      const current = engagementByDate.get(date) || { likes: 0, retweets: 0, replies: 0, count: 0 };
      current.likes += t.likes || 0;
      current.retweets += t.retweets || 0;
      current.replies += t.replies || 0;
      current.count += 1;
      engagementByDate.set(date, current);
    });

    const dailyEngagement: DailyEngagement[] = [];
    engagementByDate.forEach((data, date) => {
      const totalEngagement = data.likes + (data.retweets * 2) + data.replies;
      const engagementRate = data.count > 0 ? totalEngagement / data.count : 0;
      dailyEngagement.push({
        date,
        likes: data.likes,
        retweets: data.retweets,
        replies: data.replies,
        totalEngagement,
        tweetCount: data.count,
        engagementRate: Math.round(engagementRate * 100) / 100,
      });
    });

    // Sort by date ascending
    dailyEngagement.sort((a, b) => a.date.localeCompare(b.date));

    // ==========================================================================
    // Calculate Followers Over Time
    // ==========================================================================
    const followersOverTime: FollowerDataPoint[] = metricsData.map((m: any, i: number) => {
      const prevFollowers = i > 0 ? (metricsData[i - 1]?.followers || 0) : (m.followers || 0);
      return {
        date: m.date,
        followers: m.followers || 0,
        change: (m.followers || 0) - prevFollowers,
      };
    });

    // ==========================================================================
    // Tweet Breakdown (with profile image enrichment)
    // ==========================================================================
    
    // Fetch profile images for all unique author handles
    const authorHandles = [...new Set(tweetData.map((t: any) => t.author_handle).filter(Boolean))];
    const { profilesMap, akariUsersMap } = await fetchProfileImagesForHandles(supabase, authorHandles);
    
    const tweetBreakdown: TweetBreakdown[] = tweetData.slice(0, 50).map((t: any) => {
      const authorHandle = t.author_handle || '';
      const enrichedProfileImageUrl = getBestProfileImage(
        t.author_profile_image_url,
        authorHandle,
        profilesMap,
        akariUsersMap
      );
      
      return {
        tweetId: t.tweet_id,
        createdAt: t.created_at,
        authorHandle,
        authorName: t.author_name || authorHandle,
        authorProfileImageUrl: enrichedProfileImageUrl,
        text: t.text || '',
        likes: t.likes || 0,
        retweets: t.retweets || 0,
        replies: t.replies || 0,
        engagement: (t.likes || 0) + ((t.retweets || 0) * 2) + (t.replies || 0),
        sentimentScore: t.sentiment_score,
        isOfficial: t.is_official || false,
        tweetUrl: t.tweet_url || `https://x.com/${authorHandle}/status/${t.tweet_id}`,
      };
    });

    // Sort by engagement descending for top tweets
    tweetBreakdown.sort((a, b) => b.engagement - a.engagement);

    // ==========================================================================
    // Summary Statistics
    // ==========================================================================
    const totalLikes = tweetData.reduce((sum: number, t: any) => sum + (t.likes || 0), 0);
    const totalRetweets = tweetData.reduce((sum: number, t: any) => sum + (t.retweets || 0), 0);
    const totalReplies = tweetData.reduce((sum: number, t: any) => sum + (t.replies || 0), 0);
    const totalEngagements = totalLikes + (totalRetweets * 2) + totalReplies;

    const tweetsCount = tweetData.length;
    const avgEngagementRate = tweetsCount > 0 ? totalEngagements / tweetsCount : 0;

    const sentimentScores = tweetData
      .map((t: any) => t.sentiment_score)
      .filter((s: any) => s !== null && s !== undefined) as number[];
    const avgSentiment = sentimentScores.length > 0
      ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
      : 50;

    const firstFollowers = followersOverTime[0]?.followers || 0;
    const lastFollowers = followersOverTime[followersOverTime.length - 1]?.followers || 0;
    const followerChange = lastFollowers - firstFollowers;

    const tweetVelocity = daysBack > 0 ? tweetsCount / daysBack : 0;

    const topTweetEngagement = tweetBreakdown[0]?.engagement || 0;

    const officialTweetsCount = tweetData.filter((t: any) => t.is_official).length;
    const mentionsCount = tweetData.filter((t: any) => !t.is_official).length;

    const summary: AnalyticsSummary = {
      totalEngagements,
      avgEngagementRate: Math.round(avgEngagementRate * 100) / 100,
      tweetsCount,
      followerChange,
      tweetVelocity: Math.round(tweetVelocity * 100) / 100,
      avgSentiment: Math.round(avgSentiment),
      topTweetEngagement,
      officialTweetsCount,
      mentionsCount,
    };

    return res.status(200).json({
      ok: true,
      window,
      dailyEngagement,
      followersOverTime,
      tweetBreakdown,
      summary,
    });
  } catch (error: any) {
    console.error('[Analytics] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

