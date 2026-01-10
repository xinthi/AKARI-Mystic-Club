/**
 * API Route: GET /api/portal/arc/creator/[twitterUsername]/detailed-stats
 * 
 * Returns detailed statistics for a creator (owner view only)
 * Includes: contributions, total mindshare, average mindshare, CT Heat, Noise, Signals, etc.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { calculateCreatorSignalScore, type CreatorPostMetrics } from '@/server/arc/signal-score';
import { computeCtHeatScore } from '@/server/scoring/akari';
import { getSmartFollowers } from '@/server/smart-followers/calculate';

// =============================================================================
// TYPES
// =============================================================================

interface DetailedCreatorStats {
  twitter_username: string;
  total_arc_points: number;
  total_arenas: number;
  total_contributions: number;
  total_mindshare: number; // Total mindshare points across all projects
  average_mindshare: number; // Average mindshare per project
  total_ct_heat: number | null; // Average CT Heat across all projects
  total_noise: number | null; // Average Noise score (currently not available)
  total_signal: number | null; // Average Signal score
  total_signal_score: number | null; // Average Signal Score (0-100)
  total_trust_band: string | null; // Most common trust band
  total_smart_followers: number | null;
  smart_followers_pct: number | null;
  engagement_types: {
    threader: number;
    video: number;
    clipper: number;
    meme: number;
  };
  projects: Array<{
    project_id: string;
    project_name: string;
    project_slug: string | null;
    arena_id: string | null;
    arena_name: string | null;
    contribution_pct: number | null;
    mindshare_points: number;
    ct_heat: number | null;
    noise: number | null;
    signal: number | null;
    signal_score: number | null;
    trust_band: 'A' | 'B' | 'C' | 'D' | null;
    contributions_count: number;
  }>;
}

type DetailedStatsResponse =
  | { ok: true; stats: DetailedCreatorStats }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function normalizeTwitterUsername(username: string | null | undefined): string {
  if (!username) return '';
  return username.toLowerCase().replace(/^@+/, '').trim();
}

async function getXUserIdFromUsername(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  username: string
): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('twitter_id')
    .eq('username', username.toLowerCase().replace('@', '').trim())
    .maybeSingle();

  if (profile?.twitter_id) {
    return profile.twitter_id;
  }

  const { data: tracked } = await supabase
    .from('tracked_profiles')
    .select('x_user_id')
    .eq('username', username.toLowerCase().replace('@', '').trim())
    .maybeSingle();

  return tracked?.x_user_id || null;
}

async function buildCreatorPostMetrics(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  projectId: string,
  username: string,
  window: '24h' | '7d' | '30d' = '30d'
): Promise<CreatorPostMetrics[]> {
  const now = new Date();
  const windowStart = new Date(now);
  
  switch (window) {
    case '24h':
      windowStart.setHours(windowStart.getHours() - 24);
      break;
    case '7d':
      windowStart.setDate(windowStart.getDate() - 7);
      break;
    case '30d':
      windowStart.setDate(windowStart.getDate() - 30);
      break;
  }

  const { data: tweets } = await supabase
    .from('project_tweets')
    .select('tweet_id, author_handle, likes, replies, retweets, text, sentiment_score, created_at')
    .eq('project_id', projectId)
    .or('is_official.is.null,is_official.eq.false')
    .ilike('author_handle', username.replace('@', ''))
    .gte('created_at', windowStart.toISOString());

  if (!tweets || tweets.length === 0) {
    return [];
  }

  // Get creator's smart score and audience org score (if available)
  const xUserId = await getXUserIdFromUsername(supabase, username);
  let smartScore: number | null = null;
  let audienceOrgScore: number | null = null;

  if (xUserId) {
    const { data: smartAccount } = await supabase
      .from('smart_account_scores')
      .select('smart_score')
      .eq('x_user_id', xUserId)
      .eq('as_of_date', now.toISOString().split('T')[0])
      .order('as_of_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    smartScore = smartAccount?.smart_score ? Number(smartAccount.smart_score) : null;

    // Get audience org score from profile (if available)
    const { data: profile } = await supabase
      .from('profiles')
      .select('authenticity_score')
      .eq('username', username.toLowerCase().replace('@', '').trim())
      .maybeSingle();

    audienceOrgScore = profile?.authenticity_score || null;
  }

  // Track seen tweet texts for duplicate detection
  const seenTexts = new Set<string>();

  return tweets.map(tweet => {
    const text = tweet.text || '';
    const normalizedText = text.toLowerCase().trim();
    const isOriginal = !seenTexts.has(normalizedText);
    if (isOriginal) {
      seenTexts.add(normalizedText);
    }

    // Classify content type
    let contentType: CreatorPostMetrics['contentType'] = 'other';
    if (/\d+\/\d+/.test(text) || text.toLowerCase().includes('thread') || text.includes('🧵')) {
      contentType = 'thread';
    } else if (text.toLowerCase().includes('analysis') || text.toLowerCase().includes('deep dive')) {
      contentType = 'analysis';
    } else if (text.toLowerCase().includes('meme') || text.includes('😂')) {
      contentType = 'meme';
    } else if (text.toLowerCase().includes('quote')) {
      contentType = 'quote_rt';
    } else if (text.toLowerCase().startsWith('rt @') || text.toLowerCase().startsWith('retweet')) {
      contentType = 'retweet';
    } else if (text.toLowerCase().startsWith('@')) {
      contentType = 'reply';
    }

    const engagementPoints = (tweet.likes || 0) + (tweet.replies || 0) * 2 + (tweet.retweets || 0) * 3;

    return {
      tweetId: tweet.tweet_id || '',
      engagementPoints,
      createdAt: new Date(tweet.created_at || now),
      contentType,
      isOriginal,
      sentimentScore: tweet.sentiment_score || null,
      smartScore: smartScore || null,
      audienceOrgScore: audienceOrgScore || null,
    };
  });
}

function classifyTweetType(text: string | null): 'threader' | 'video' | 'clipper' | 'meme' | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  
  if (lower.includes('thread') || (text.split('\n').length > 3 && lower.includes('1/'))) {
    return 'threader';
  }
  if (lower.includes('video') || lower.includes('watch') || lower.includes('youtube.com') || lower.includes('youtu.be')) {
    return 'video';
  }
  if (lower.includes('clip') || lower.includes('snippet')) {
    return 'clipper';
  }
  if (lower.includes('meme') || lower.match(/^[a-z\s]+$/i) && text.length < 100) {
    return 'meme';
  }
  
  return null;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DetailedStatsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { twitterUsername } = req.query;

  if (!twitterUsername || typeof twitterUsername !== 'string') {
    return res.status(400).json({ ok: false, error: 'Twitter username is required' });
  }

  try {
    const user = await requirePortalUser(req, res);
    if (!user) {
      return; // requirePortalUser already sent 401 response
    }

    const supabase = getSupabaseAdmin();
    const normalizedUsername = normalizeTwitterUsername(twitterUsername);

    // Get all arenas this creator is in
    const { data: arenaCreators, error: arenaError } = await supabase
      .from('arena_creators')
      .select(`
        arena_id,
        arc_points,
        arenas!inner (
          id,
          name,
          project_id,
          projects!inner (
            id,
            name,
            slug
          )
        )
      `)
      .ilike('twitter_username', normalizedUsername);

    if (arenaError) {
      console.error('[DetailedStats] Error fetching arenas:', arenaError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch creator data' });
    }

    if (!arenaCreators || arenaCreators.length === 0) {
      return res.status(404).json({ ok: false, error: 'Creator not found in any arenas' });
    }

    // Get all contributions (mentions) for this creator across all projects
    const projectIds = [...new Set(arenaCreators.map((ac: any) => ac.arenas?.projects?.id).filter(Boolean))];
    
    const { data: contributions, error: contribError } = await supabase
      .from('project_tweets')
      .select('project_id, tweet_id, likes, replies, retweets, text, sentiment_score, created_at')
      .in('project_id', projectIds)
      .or('is_official.is.null,is_official.eq.false')
      .ilike('author_handle', normalizedUsername);

    if (contribError) {
      console.error('[DetailedStats] Error fetching contributions:', contribError);
    }

    // Calculate stats per project
    const projectStatsMap = new Map<string, {
      project_id: string;
      project_name: string;
      project_slug: string | null;
      arena_id: string | null;
      arena_name: string | null;
      mindshare_points: number;
      contributions_count: number;
      ct_heat: number | null;
      noise: number | null;
      signal: number | null;
      signal_score: number | null;
      trust_band: 'A' | 'B' | 'C' | 'D' | null;
      contribution_pct: number | null;
    }>();

    let totalMindshare = 0;
    let totalContributions = 0;
    const engagementTypes = { threader: 0, video: 0, clipper: 0, meme: 0 };
    const ctHeatScores: number[] = [];
    const signalScores: number[] = [];
    const signalScoreValues: number[] = [];
    const trustBands: string[] = [];

    for (const arenaCreator of arenaCreators) {
      const arena = (arenaCreator as any).arenas;
      const project = arena?.projects;
      if (!arena || !project) continue;

      const projectId = project.id;
      const projectContributions = (contributions || []).filter(c => c.project_id === projectId);
      
      // Calculate mindshare points (engagement: likes + replies*2 + retweets*3)
      let projectMindshare = 0;
      for (const contrib of projectContributions) {
        const engagement = (contrib.likes || 0) + (contrib.replies || 0) * 2 + (contrib.retweets || 0) * 3;
        projectMindshare += engagement;
        
        // Classify engagement type
        const tweetType = classifyTweetType(contrib.text);
        if (tweetType) {
          engagementTypes[tweetType]++;
        }
      }

      totalMindshare += projectMindshare;
      totalContributions += projectContributions.length;

      // Calculate Signal Score, CT Heat, etc. for this project
      const postMetrics = await buildCreatorPostMetrics(supabase, projectId, normalizedUsername, '30d');
      
      // Calculate CT Heat from tweets
      let ctHeat: number | null = null;
      if (projectContributions.length > 0) {
        const mentionsCount = projectContributions.length;
        const totalLikes = projectContributions.reduce((sum, t) => sum + (t.likes || 0), 0);
        const totalRetweets = projectContributions.reduce((sum, t) => sum + (t.retweets || 0), 0);
        const avgLikes = totalLikes / mentionsCount;
        const avgRetweets = totalRetweets / mentionsCount;
        const uniqueAuthors = 1; // Single creator
        
        ctHeat = computeCtHeatScore(
          mentionsCount,
          avgLikes,
          avgRetweets,
          uniqueAuthors,
          0 // influencerMentions (not applicable for single creator)
        );
      }

      // Calculate Signal Score
      let signalScore: number | null = null;
      let trustBand: 'A' | 'B' | 'C' | 'D' | null = null;
      if (postMetrics.length > 0) {
        const xUserId = await getXUserIdFromUsername(supabase, normalizedUsername);
        let smartFollowersCount = 0;
        
        if (xUserId) {
          try {
            const smartResult = await getSmartFollowers(
              supabase,
              'creator',
              xUserId,
              xUserId,
              new Date()
            );
            smartFollowersCount = smartResult.smart_followers_count || 0;
          } catch (error) {
            console.error('[DetailedStats] Error getting smart followers:', error);
          }
        }
        
        const signalResult = calculateCreatorSignalScore(
          postMetrics,
          '30d',
          false, // isJoined - we don't track this per project
          smartFollowersCount
        );
        signalScore = signalResult.signal_score;
        trustBand = signalResult.trust_band;
      }

      if (signalScore !== null) {
        signalScores.push(signalScore);
        signalScoreValues.push(signalScore);
      }
      if (ctHeat !== null) ctHeatScores.push(ctHeat);
      if (trustBand) trustBands.push(trustBand);

      // Get contribution percentage (need to calculate total project mindshare)
      const { data: allProjectContributions } = await supabase
        .from('project_tweets')
        .select('likes, replies, retweets')
        .eq('project_id', projectId)
        .or('is_official.is.null,is_official.eq.false')
        .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

      let totalProjectMindshare = 0;
      if (allProjectContributions) {
        for (const contrib of allProjectContributions) {
          totalProjectMindshare += (contrib.likes || 0) + (contrib.replies || 0) * 2 + (contrib.retweets || 0) * 3;
        }
      }

      const contributionPct = totalProjectMindshare > 0 
        ? (projectMindshare / totalProjectMindshare) * 100 
        : null;

      projectStatsMap.set(projectId, {
        project_id: projectId,
        project_name: project.name,
        project_slug: project.slug || null,
        arena_id: arena.id,
        arena_name: arena.name,
        mindshare_points: projectMindshare,
        contributions_count: projectContributions.length,
        ct_heat: ctHeat,
        noise: null, // Noise score not available from signal score calculation
        signal: signalScore,
        signal_score: signalScore,
        trust_band: trustBand,
        contribution_pct: contributionPct,
      });
    }

    // Calculate totals
    const totalArcPoints = arenaCreators.reduce((sum, ac) => sum + (Number(ac.arc_points) || 0), 0);
    const uniqueArenas = new Set(arenaCreators.map((ac: any) => ac.arena_id));
    const totalArenas = uniqueArenas.size;

    // Calculate averages
    const avgCtHeat = ctHeatScores.length > 0 
      ? ctHeatScores.reduce((a, b) => a + b, 0) / ctHeatScores.length 
      : null;
    const avgSignal = signalScores.length > 0 
      ? signalScores.reduce((a, b) => a + b, 0) / signalScores.length 
      : null;
    const avgSignalScore = signalScoreValues.length > 0 
      ? signalScoreValues.reduce((a, b) => a + b, 0) / signalScoreValues.length 
      : null;

    // Most common trust band
    const trustBandCounts = new Map<string, number>();
    for (const band of trustBands) {
      trustBandCounts.set(band, (trustBandCounts.get(band) || 0) + 1);
    }
    let mostCommonTrustBand: string | null = null;
    let maxCount = 0;
    for (const [band, count] of trustBandCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonTrustBand = band;
      }
    }

    // Get Smart Followers
    const xUserId = await getXUserIdFromUsername(supabase, normalizedUsername);
    let smartFollowersCount: number | null = null;
    let smartFollowersPct: number | null = null;

    if (xUserId) {
      try {
        const smartResult = await getSmartFollowers(
          supabase,
          'creator',
          xUserId,
          xUserId,
          new Date()
        );
        smartFollowersCount = smartResult.smart_followers_count;
        smartFollowersPct = smartResult.smart_followers_pct;
      } catch (error) {
        console.error('[DetailedStats] Error calculating smart followers:', error);
      }
    }

    const stats: DetailedCreatorStats = {
      twitter_username: normalizedUsername,
      total_arc_points: totalArcPoints,
      total_arenas: totalArenas,
      total_contributions: totalContributions,
      total_mindshare: totalMindshare,
      average_mindshare: projectStatsMap.size > 0 ? totalMindshare / projectStatsMap.size : 0,
      total_ct_heat: avgCtHeat,
      total_noise: null, // Noise score not available from signal score calculation
      total_signal: avgSignal,
      total_signal_score: avgSignalScore,
      total_trust_band: mostCommonTrustBand as 'A' | 'B' | 'C' | 'D' | null,
      total_smart_followers: smartFollowersCount,
      smart_followers_pct: smartFollowersPct,
      engagement_types: engagementTypes,
      projects: Array.from(projectStatsMap.values()),
    };

    return res.status(200).json({ ok: true, stats });
  } catch (error: any) {
    console.error('[DetailedStats] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}
