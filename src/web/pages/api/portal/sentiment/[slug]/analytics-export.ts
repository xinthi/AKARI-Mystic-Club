/**
 * API Route: GET /api/portal/sentiment/[slug]/analytics-export
 * 
 * Exports Twitter Analytics data as CSV for Analyst+ users.
 * Requires markets.analytics permission.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createPortalClient, getProjectBySlug } from '@/lib/portal/supabase';
import { can } from '@/lib/permissions';

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
    console.error('[Analytics Export] Error getting user:', error);
    return null;
  }
}

// Escape CSV field
function escapeCsvField(field: string | number | null | undefined): string {
  if (field === null || field === undefined) {
    return '';
  }
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
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

    // Check analytics permission
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

    if (!can(akariUser, 'markets.analytics')) {
      return res.status(403).json({ ok: false, error: 'Analytics access required' });
    }

    // Get project
    const supabase = createPortalClient();
    const project = await getProjectBySlug(supabase, slug);

    if (!project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    // Fetch analytics data (reuse logic from analytics.ts)
    const { data: tweets, error: tweetsError } = await supabase
      .from('project_tweets')
      .select('*')
      .eq('project_id', project.id)
      .gte('created_at', startDateStr)
      .order('created_at', { ascending: false });

    if (tweetsError) {
      console.error('[Analytics Export] Tweets error:', tweetsError);
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
      console.error('[Analytics Export] Metrics error:', metricsError);
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

    const dailyEngagement: Array<{
      date: string;
      likes: number;
      retweets: number;
      replies: number;
      totalEngagement: number;
    }> = [];
    engagementByDate.forEach((data, date) => {
      const totalEngagement = data.likes + (data.retweets * 2) + data.replies;
      dailyEngagement.push({
        date,
        likes: data.likes,
        retweets: data.retweets,
        replies: data.replies,
        totalEngagement,
      });
    });

    // Sort by date ascending
    dailyEngagement.sort((a, b) => a.date.localeCompare(b.date));

    // ==========================================================================
    // Calculate Followers Over Time
    // ==========================================================================
    const followersOverTime: Array<{ date: string; followers: number }> = metricsData.map((m: any) => ({
      date: m.date,
      followers: m.followers || 0,
    }));

    // ==========================================================================
    // Tweet Breakdown
    // ==========================================================================
    const tweetBreakdown: Array<{
      tweetId: string;
      tweetUrl: string;
      date: string;
      isOfficial: boolean;
      isMention: boolean;
      likes: number;
      replies: number;
      quotes: number;
      retweets: number;
      totalEngagement: number;
    }> = tweetData.map((t: any) => {
      const date = (t.created_at || '').split('T')[0];
      const isOfficial = t.is_official || false;
      const isMention = !isOfficial;
      const likes = t.likes || 0;
      const replies = t.replies || 0;
      const quotes = t.quotes || 0;
      const retweets = t.retweets || 0;
      const totalEngagement = likes + (retweets * 2) + replies;
      const tweetUrl = t.tweet_url || `https://x.com/${t.author_handle}/status/${t.tweet_id}`;

      return {
        tweetId: t.tweet_id,
        tweetUrl,
        date,
        isOfficial,
        isMention,
        likes,
        replies,
        quotes,
        retweets,
        totalEngagement,
      };
    });

    // Sort by engagement descending
    tweetBreakdown.sort((a, b) => b.totalEngagement - a.totalEngagement);

    // ==========================================================================
    // Build CSV
    // ==========================================================================
    const csvRows: string[] = [];

    // Section 1: Daily Engagement
    csvRows.push(`DAILY_ENGAGEMENT_${window.toUpperCase()}`);
    csvRows.push('date,likes,replies,quotes,retweets,total_engagement');
    for (const day of dailyEngagement) {
      const quotes = 0; // Not tracked separately in current data
      csvRows.push([
        escapeCsvField(day.date),
        escapeCsvField(day.likes),
        escapeCsvField(day.replies),
        escapeCsvField(quotes),
        escapeCsvField(day.retweets),
        escapeCsvField(day.totalEngagement),
      ].join(','));
    }

    // Blank line
    csvRows.push('');

    // Section 2: Followers History
    csvRows.push(`FOLLOWERS_HISTORY_${window.toUpperCase()}`);
    csvRows.push('date,followers');
    for (const point of followersOverTime) {
      csvRows.push([
        escapeCsvField(point.date),
        escapeCsvField(point.followers),
      ].join(','));
    }

    // Blank line
    csvRows.push('');

    // Section 3: Tweet Breakdown
    csvRows.push(`TWEET_BREAKDOWN_${window.toUpperCase()}`);
    csvRows.push('tweet_id,tweet_url,date,is_official,is_mention,likes,replies,quotes,retweets,total_engagement');
    for (const tweet of tweetBreakdown) {
      csvRows.push([
        escapeCsvField(tweet.tweetId),
        escapeCsvField(tweet.tweetUrl),
        escapeCsvField(tweet.date),
        escapeCsvField(tweet.isOfficial ? 'true' : 'false'),
        escapeCsvField(tweet.isMention ? 'true' : 'false'),
        escapeCsvField(tweet.likes),
        escapeCsvField(tweet.replies),
        escapeCsvField(tweet.quotes),
        escapeCsvField(tweet.retweets),
        escapeCsvField(tweet.totalEngagement),
      ].join(','));
    }

    const csvContent = csvRows.join('\n');

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="akari-analytics-${slug}.csv"`);
    
    return res.status(200).send(csvContent);
  } catch (error: any) {
    console.error(`[Analytics Export] Error:`, error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to export data' });
  }
}

