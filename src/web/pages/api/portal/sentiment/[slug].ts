/**
 * API Route: GET /api/portal/sentiment/[slug]
 * 
 * Returns detailed sentiment data for a specific project:
 * - Project info with profile image
 * - Metrics history (last 30 days) for charts
 * - 24h changes for latest metrics
 * - Project tweets for chart markers
 * - Top influencers (inner circle members)
 * - Inner circle summary
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createPortalClient,
  getProjectBySlug,
  getProjectMetricsHistory,
  getProjectInfluencers,
  compute24hChanges,
  fetchProfileImagesForHandles,
  getBestProfileImage,
  Project,
  MetricsDaily,
  MetricsChange24h,
  InfluencerWithRelation,
} from '@/lib/portal/supabase';
import { getProjectTopicStats, TopicScore } from '@/lib/portal/topic-stats';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { calculateProjectMindshare } from '@/server/mindshare/calculate';
import { getSmartFollowers, getSmartFollowersDeltas } from '@/server/smart-followers/calculate';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Tweet data for chart markers - uses camelCase for frontend consistency
 */
interface ProjectTweet {
  tweetId: string;
  createdAt: string;
  authorHandle: string;
  authorName: string | null;
  authorProfileImageUrl: string | null;
  text: string;
  likes: number;
  replies: number;
  retweets: number;
  sentimentScore: number | null;
  engagementScore: number | null;
  tweetUrl: string;
  isKOL: boolean;
  isOfficial: boolean;
}

interface InnerCircleSummary {
  count: number;
  power: number;
}

type SentimentDetailResponse =
  | {
      ok: true;
      project: Project & {
        twitter_profile_image_url?: string | null;
      };
      metrics: MetricsDaily[];
      latestMetrics: MetricsDaily | null;
      previousMetrics: MetricsDaily | null;
      changes24h: MetricsChange24h;
      tweets: ProjectTweet[];
      influencers: InfluencerWithRelation[];
      innerCircle: InnerCircleSummary;
      topics30d: TopicScore[];
      metricsHistoryLong?: MetricsDaily[]; // 90-day history for Deep Explorer
      // Mindshare and Smart Followers data
      mindshare?: {
        bps_24h: number | null;
        bps_48h: number | null;
        bps_7d: number | null;
        bps_30d: number | null;
        delta_1d: number | null;
        delta_7d: number | null;
      };
      smartFollowers?: {
        count: number | null;
        pct: number | null;
        delta_7d: number | null;
        delta_30d: number | null;
      };
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SentimentDetailResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ ok: false, error: 'Project slug is required' });
  }

  try {
    const supabase = createPortalClient();
    const supabaseAdmin = getSupabaseAdmin();

    // Fetch project by slug
    const project = await getProjectBySlug(supabase, slug);

    if (!project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    // Fetch metrics history, influencers, tweets, topic stats in parallel
    const [metrics, metrics90d, influencers, tweetsResult, topics30d] = await Promise.all([
      getProjectMetricsHistory(supabase, project.id, 30),
      getProjectMetricsHistory(supabase, project.id, 90), // 90-day history for Deep Explorer
      getProjectInfluencers(supabase, project.id, 10),
      supabase
        .from('project_tweets')
        .select(`
          tweet_id,
          created_at,
          author_handle,
          author_name,
          author_profile_image_url,
          text,
          likes,
          replies,
          retweets,
          sentiment_score,
          engagement_score,
          tweet_url,
          is_kol,
          is_official
        `)
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(50),
      getProjectTopicStats(supabase, project.id, '30d'),
    ]);
    
    // Fetch followers fallback separately to avoid breaking the main query if it fails
    let followersFallbackResult: { data: { followers: number; date: string } | null; error: any } | null = null;
    try {
      followersFallbackResult = await supabase
        .from('metrics_daily')
        .select('followers, date')
        .eq('project_id', project.id)
        .gt('followers', 0)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
    } catch (fallbackError: any) {
      console.warn(`[API /portal/sentiment/${slug}] Followers fallback query failed:`, fallbackError);
      followersFallbackResult = { data: null, error: fallbackError };
    }

    // DEBUG: Log tweet query results
    console.log(`[API /portal/sentiment/${slug}] Project ID: ${project.id}`);
    console.log(`[API /portal/sentiment/${slug}] Tweets query result: ${tweetsResult.data?.length || 0} tweets, error: ${tweetsResult.error?.message || 'none'}`);
    if (tweetsResult.data && tweetsResult.data.length > 0) {
      console.log(`[API /portal/sentiment/${slug}] Sample tweet:`, JSON.stringify(tweetsResult.data[0], null, 2));
    }

    // =========================================================================
    // ENRICH TWEETS WITH PROFILE IMAGES FROM DATABASE
    // For tweets missing author_profile_image_url, look up from:
    // 1. profiles table (CT influencers)
    // 2. akari_users + akari_user_identities (registered AKARI users)
    // Uses case-insensitive matching since Twitter handles can vary in casing
    // =========================================================================
    const rawTweets = tweetsResult.data || [];
    const authorsNeedingImages = rawTweets
      .filter((t: any) => !t.author_profile_image_url && t.author_handle)
      .map((t: any) => t.author_handle);
    
    // Build a map of author handle (lowercase) -> profile image URL
    const authorProfileImages = new Map<string, string>();
    
    if (authorsNeedingImages.length > 0) {
      const uniqueAuthorsSet = new Set(authorsNeedingImages.map((h: string) => h.toLowerCase()));
      const uniqueAuthors = Array.from(uniqueAuthorsSet);
      
      try {
        // 1. Fetch from profiles table (CT influencers)
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('username, profile_image_url')
          .not('profile_image_url', 'is', null);
        
        if (profilesData && profilesData.length > 0) {
          for (const p of profilesData) {
            if (p.username && p.profile_image_url) {
              const usernameLower = p.username.toLowerCase();
              if (uniqueAuthors.includes(usernameLower)) {
                authorProfileImages.set(usernameLower, p.profile_image_url);
              }
            }
          }
        }
        
        // 2. Fetch from akari_users (registered AKARI platform users)
        // Join with akari_user_identities to get X username
        const { data: akariUsersData } = await supabase
          .from('akari_user_identities')
          .select(`
            username,
            akari_users!inner (
              avatar_url
            )
          `)
          .eq('provider', 'x')
          .not('akari_users.avatar_url', 'is', null);
        
        if (akariUsersData && akariUsersData.length > 0) {
          for (const u of akariUsersData) {
            if (u.username && (u as any).akari_users?.avatar_url) {
              const usernameLower = u.username.toLowerCase();
              // Only add if not already found in profiles table
              if (uniqueAuthors.includes(usernameLower) && !authorProfileImages.has(usernameLower)) {
                authorProfileImages.set(usernameLower, (u as any).akari_users.avatar_url);
              }
            }
          }
        }
        
        if (authorProfileImages.size > 0) {
          console.log(`[API /portal/sentiment/${slug}] Enriched ${authorProfileImages.size}/${uniqueAuthors.length} tweet authors with profile images`);
        }
      } catch (err: any) {
        // Non-critical, just log and continue
        console.warn(`[API /portal/sentiment/${slug}] Could not fetch author profile images:`, err.message);
      }
    }

    // Map tweets to camelCase for frontend
    // Use project's x_handle as fallback for author when constructing URLs
    const projectHandle = project.x_handle || project.slug;
    const projectProfileImageUrl = (project as any).twitter_profile_image_url || project.avatar_url || null;
    
    const tweets: ProjectTweet[] = rawTweets.map((t: any) => {
      const authorHandle = t.author_handle || projectHandle;
      // Prefer stored tweet_url, but validate it's not malformed (no double slashes)
      let tweetUrl = t.tweet_url;
      if (!tweetUrl || tweetUrl.includes('//status/')) {
        // Reconstruct URL if missing or malformed
        tweetUrl = `https://x.com/${authorHandle}/status/${t.tweet_id}`;
      }
      
      // Get profile image with priority:
      // 1. From tweet record in DB (author_profile_image_url)
      // 2. From profiles table lookup (CT influencers)
      // 3. For official tweets: use project's profile image
      // 4. null (frontend will show letter avatar)
      const profileImageFromDb = t.author_profile_image_url || null;
      const profileImageFromProfiles = authorProfileImages.get(authorHandle.toLowerCase()) || null;
      const isOfficial = t.is_official || false;
      const authorProfileImageUrl = profileImageFromDb || profileImageFromProfiles || (isOfficial ? projectProfileImageUrl : null);
      
      return {
        tweetId: t.tweet_id,
        createdAt: t.created_at,
        authorHandle,
        authorName: t.author_name || authorHandle,
        authorProfileImageUrl,
        text: t.text || '',
        likes: t.likes || 0,
        replies: t.replies || 0,
        retweets: t.retweets || 0,
        sentimentScore: t.sentiment_score ?? null,
        engagementScore: t.engagement_score ?? ((t.likes || 0) + (t.retweets || 0) * 2 + (t.replies || 0) * 3),
        tweetUrl,
        isKOL: t.is_kol || false,
        isOfficial,
      };
    });

    // Extract latest and previous metrics for 24h changes
    let latestMetrics = metrics.length > 0 ? metrics[0] : null;
    const previousMetrics = metrics.length > 1 ? metrics[1] : null;
    
    // Apply followers fallback: use latest if > 0, else use most recent non-zero value
    const fallbackFollowers = followersFallbackResult?.data?.followers ?? null;
    if (latestMetrics) {
      const metricsFollowers = latestMetrics.followers ?? null;
      const finalFollowers = 
        (metricsFollowers !== null && metricsFollowers > 0)
          ? metricsFollowers
          : (fallbackFollowers !== null && fallbackFollowers > 0)
          ? fallbackFollowers
          : null;
      
      // Create a new object with updated followers to avoid mutation
      latestMetrics = {
        ...latestMetrics,
        followers: finalFollowers,
      };
      
      // Also update the first entry in the metrics array so the history table shows correct value
      if (metrics.length > 0) {
        metrics[0] = {
          ...metrics[0],
          followers: finalFollowers,
        };
      }
    }
    
    const changes24h = compute24hChanges(latestMetrics, previousMetrics);

    // DEBUG: Log metrics and influencers
    console.log(`[API /portal/sentiment/${slug}] Metrics: ${metrics.length} days, latest tweet_count: ${metrics[0]?.tweet_count ?? 'N/A'}`);
    console.log(`[API /portal/sentiment/${slug}] Influencers: ${influencers.length}`);
    console.log(`[API /portal/sentiment/${slug}] Project inner_circle_count: ${(project as any).inner_circle_count}, inner_circle_power: ${(project as any).inner_circle_power}`);

    // Compute inner circle summary from project data or estimate from influencers
    const innerCircle: InnerCircleSummary = {
      count: (project as any).inner_circle_count || influencers.length,
      power: (project as any).inner_circle_power || 
        influencers.reduce((sum, inf) => sum + (inf.akari_score || 0), 0),
    };

    // Ensure we have a profile image URL and add last_updated_at
    const enhancedProject = {
      ...project,
      twitter_profile_image_url: 
        (project as any).twitter_profile_image_url || 
        project.avatar_url ||
        null,
      last_updated_at: latestMetrics?.updated_at ?? latestMetrics?.created_at ?? null,
    };

    // Calculate mindshare for all windows
    const mindshareData: {
      bps_24h: number | null;
      bps_48h: number | null;
      bps_7d: number | null;
      bps_30d: number | null;
      delta_1d: number | null;
      delta_7d: number | null;
    } = {
      bps_24h: null,
      bps_48h: null,
      bps_7d: null,
      bps_30d: null,
      delta_1d: null,
      delta_7d: null,
    };

    try {
      const [mindshare24h, mindshare48h, mindshare7d, mindshare30d] = await Promise.all([
        calculateProjectMindshare(supabaseAdmin, project.id, '24h').catch(() => ({ mindshare_bps: 0, delta_bps_1d: null, delta_bps_7d: null })),
        calculateProjectMindshare(supabaseAdmin, project.id, '48h').catch(() => ({ mindshare_bps: 0, delta_bps_1d: null, delta_bps_7d: null })),
        calculateProjectMindshare(supabaseAdmin, project.id, '7d').catch(() => ({ mindshare_bps: 0, delta_bps_1d: null, delta_bps_7d: null })),
        calculateProjectMindshare(supabaseAdmin, project.id, '30d').catch(() => ({ mindshare_bps: 0, delta_bps_1d: null, delta_bps_7d: null })),
      ]);

      mindshareData.bps_24h = mindshare24h.mindshare_bps > 0 ? mindshare24h.mindshare_bps : null;
      mindshareData.bps_48h = mindshare48h.mindshare_bps > 0 ? mindshare48h.mindshare_bps : null;
      mindshareData.bps_7d = mindshare7d.mindshare_bps > 0 ? mindshare7d.mindshare_bps : null;
      mindshareData.bps_30d = mindshare30d.mindshare_bps > 0 ? mindshare30d.mindshare_bps : null;
      mindshareData.delta_1d = mindshare7d.delta_bps_1d;
      mindshareData.delta_7d = mindshare7d.delta_bps_7d;
    } catch (error) {
      console.error(`[API /portal/sentiment/${slug}] Error calculating mindshare:`, error);
      // Continue with null values
    }

    // Calculate Smart Followers
    const smartFollowersData: {
      count: number | null;
      pct: number | null;
      delta_7d: number | null;
      delta_30d: number | null;
    } = {
      count: null,
      pct: null,
      delta_7d: null,
      delta_30d: null,
    };

    try {
      // Get project's X user ID
      const xHandle = project.x_handle || project.twitter_username;
      let xUserId: string | null = null;

      if (xHandle) {
        const cleanHandle = xHandle.replace('@', '').toLowerCase().trim();
        // Try to get x_user_id from profiles or tracked_profiles
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('twitter_id')
          .eq('username', cleanHandle)
          .maybeSingle();

        if (profile?.twitter_id) {
          xUserId = profile.twitter_id;
        } else {
          const { data: tracked } = await supabaseAdmin
            .from('tracked_profiles')
            .select('x_user_id')
            .eq('username', cleanHandle)
            .maybeSingle();

          xUserId = tracked?.x_user_id || null;
        }
      }

      if (xUserId) {
        const smartFollowersResult = await getSmartFollowers(supabaseAdmin, xUserId);
        smartFollowersData.count = smartFollowersResult.count;
        smartFollowersData.pct = smartFollowersResult.pct;

        // Get deltas
        const deltas = await getSmartFollowersDeltas(supabaseAdmin, xUserId);
        smartFollowersData.delta_7d = deltas.delta_7d;
        smartFollowersData.delta_30d = deltas.delta_30d;
      }
    } catch (error) {
      console.error(`[API /portal/sentiment/${slug}] Error calculating smart followers:`, error);
      // Continue with null values
    }

    return res.status(200).json({
      ok: true,
      project: enhancedProject,
      metrics,
      latestMetrics,
      previousMetrics,
      changes24h,
      tweets,
      influencers,
      innerCircle,
      topics30d,
      metricsHistoryLong: metrics90d, // 90-day history for Deep Explorer
      mindshare: mindshareData,
      smartFollowers: smartFollowersData,
    });
  } catch (error: any) {
    console.error(`[API /portal/sentiment/${slug}] Error:`, error);

    if (error.message?.includes('configuration missing')) {
      return res.status(503).json({ ok: false, error: 'Sentiment service is not configured' });
    }

    return res.status(500).json({ ok: false, error: error.message || 'Failed to fetch project data' });
  }
}
