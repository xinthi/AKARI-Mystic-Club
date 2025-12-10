/**
 * API Route: GET /api/portal/deep/[slug]/summary-export
 * 
 * Exports comprehensive project summary as CSV for Deep Explorer users.
 * Requires canUseDeepExplorer permission.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  createPortalClient,
  getProjectBySlug,
  getProjectInfluencers,
  getProjectMetricsHistory,
} from '@/lib/portal/supabase';
import { canUseDeepExplorer } from '@/lib/permissions';
import { getProjectTopicStats } from '@/lib/portal/topic-stats';

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
    console.error('[Summary Export] Error getting user:', error);
    return null;
  }
}

// Compute power metric (same as frontend)
function computeInfluencerPower(inf: any): number {
  const followers = inf.followers ?? 0;
  const akari = inf.akari_score ?? 0;
  const sentiment = inf.avg_sentiment_30d ?? 50;
  
  return akari * 0.5 + Math.log10(followers + 1) * 20 + sentiment * 0.3;
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ ok: false, error: 'Project slug is required' });
  }

  try {
    // Authenticate user
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    // Check Deep Explorer permission
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

    if (!canUseDeepExplorer(akariUser)) {
      return res.status(403).json({ ok: false, error: 'Deep Explorer access required' });
    }

    // Get project
    const supabase = createPortalClient();
    const project = await getProjectBySlug(supabase, slug);

    if (!project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    // Fetch all data in parallel
    const [
      metrics30d,
      influencers,
      topicStats,
      tweetsResult,
      latestMetrics,
      followersFallback,
    ] = await Promise.all([
      getProjectMetricsHistory(supabase, project.id, 30),
      getProjectInfluencers(supabase, project.id, 1000), // Get all for export
      getProjectTopicStats(supabase, project.id, '30d'),
      supabase
        .from('project_tweets')
        .select('created_at, likes, replies, retweets')
        .eq('project_id', project.id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('metrics_daily')
        .select('*')
        .eq('project_id', project.id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Get most recent non-zero followers for fallback (same logic as Sentiment overview)
      supabase
        .from('metrics_daily')
        .select('project_id, followers')
        .eq('project_id', project.id)
        .gt('followers', 0)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Get latest metrics for project info
    const latest = latestMetrics.data || null;
    const latestAkariScore = latest?.akari_score ?? null;
    const latestSentiment = latest?.sentiment_score ?? null;
    const latestCtHeat = latest?.ct_heat_score ?? null;
    const lastUpdatedAt = latest?.updated_at ?? latest?.created_at ?? latest?.date ?? null;
    
    // Compute followers with fallback: metrics_daily.followers > 0, else most recent non-zero from metrics_daily, else 0
    const metricsFollowers = latest?.followers ?? null;
    const fallbackFollowers = followersFallback.data?.followers ?? null;
    const followers =
      metricsFollowers && metricsFollowers > 0
        ? metricsFollowers
        : fallbackFollowers && fallbackFollowers > 0
        ? fallbackFollowers
        : 0;

    // Calculate engagement summary (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentTweets = (tweetsResult.data || []).filter((t: any) => {
      const tweetDate = new Date(t.created_at);
      return tweetDate >= thirtyDaysAgo;
    });

    const engagementSummary = {
      totalLikes: 0,
      totalReplies: 0,
      totalQuotes: 0, // Not available in schema, set to 0
      totalRetweets: 0,
    };

    for (const tweet of recentTweets) {
      engagementSummary.totalLikes += tweet.likes || 0;
      engagementSummary.totalReplies += tweet.replies || 0;
      engagementSummary.totalRetweets += tweet.retweets || 0;
    }

    // Get top 25 influencers by power score
    const influencersWithPower = influencers.map(inf => ({
      ...inf,
      powerScore: computeInfluencerPower(inf),
    })).sort((a, b) => b.powerScore - a.powerScore).slice(0, 25);

    // Build CSV sections
    const csvRows: string[] = [];

    // Section 1: PROJECT_INFO
    csvRows.push('Section: PROJECT_INFO');
    csvRows.push('key,value');
    csvRows.push(`name,${escapeCsvField(project.name)}`);
    csvRows.push(`slug,${escapeCsvField(project.slug)}`);
    csvRows.push(`x_handle,${escapeCsvField(project.x_handle || '')}`);
    csvRows.push(`followers,${escapeCsvField(followers)}`);
    csvRows.push(`akari_score,${escapeCsvField(latestAkariScore)}`);
    csvRows.push(`sentiment_30d,${escapeCsvField(latestSentiment)}`);
    csvRows.push(`ct_heat_30d,${escapeCsvField(latestCtHeat)}`);
    csvRows.push(`last_updated_at,${escapeCsvField(lastUpdatedAt)}`);
    csvRows.push(''); // Blank line

    // Section 2: METRICS_HISTORY_30D
    csvRows.push('Section: METRICS_HISTORY_30D');
    csvRows.push('date,akari_score,sentiment_score,ct_heat_score,followers');
    for (const metric of metrics30d) {
      csvRows.push([
        escapeCsvField(metric.date),
        escapeCsvField(metric.akari_score),
        escapeCsvField(metric.sentiment_score),
        escapeCsvField(metric.ct_heat_score),
        escapeCsvField(metric.followers),
      ].join(','));
    }
    csvRows.push(''); // Blank line

    // Section 3: TOPIC_STATS_30D
    csvRows.push('Section: TOPIC_STATS_30D');
    csvRows.push('topic,score,weighted_score,tweet_count');
    for (const topic of topicStats) {
      csvRows.push([
        escapeCsvField(topic.topic),
        escapeCsvField(topic.score),
        escapeCsvField(topic.weightedScore),
        escapeCsvField(topic.tweetCount),
      ].join(','));
    }
    if (topicStats.length === 0) {
      // Ensure at least header row exists
    }
    csvRows.push(''); // Blank line

    // Section 4: INNER_CIRCLE
    csvRows.push('Section: INNER_CIRCLE');
    csvRows.push('handle,followers,akari_score,sentiment_30d,ct_heat_30d,power_score');
    for (const inf of influencersWithPower) {
      const handle = (inf.x_handle || '').replace(/^@/, '');
      csvRows.push([
        escapeCsvField(handle),
        escapeCsvField(inf.followers),
        escapeCsvField(inf.akari_score),
        escapeCsvField(inf.avg_sentiment_30d),
        escapeCsvField(''), // ct_heat_30d not available in current data structure
        escapeCsvField(Math.round(inf.powerScore)),
      ].join(','));
    }
    csvRows.push(''); // Blank line

    // Section 5: ENGAGEMENT_SUMMARY_30D
    csvRows.push('Section: ENGAGEMENT_SUMMARY_30D');
    csvRows.push('total_likes_30d,total_replies_30d,total_quotes_30d,total_retweets_30d');
    csvRows.push([
      escapeCsvField(engagementSummary.totalLikes),
      escapeCsvField(engagementSummary.totalReplies),
      escapeCsvField(engagementSummary.totalQuotes),
      escapeCsvField(engagementSummary.totalRetweets),
    ].join(','));

    const csvContent = csvRows.join('\n');

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="akari-summary-${slug}.csv"`);
    
    return res.status(200).send(csvContent);
  } catch (error: any) {
    console.error(`[Summary Export] Error:`, error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to export data' });
  }
}

