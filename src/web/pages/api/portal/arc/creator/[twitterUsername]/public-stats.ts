/**
 * API Route: GET /api/portal/arc/creator/[twitterUsername]/public-stats
 * 
 * Returns public statistics for a creator (no authentication required)
 * Includes: Total ARC points, arenas joined, CT Heat, Noise, Signals, Engagement Types, Signal Score, Trust, Smart Followers
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { calculateCreatorSignalScore, type CreatorPostMetrics } from '@/server/arc/signal-score';
import { computeCtHeatScore } from '@/server/scoring/akari';
import { getSmartFollowers } from '@/server/smart-followers/calculate';

// =============================================================================
// TYPES
// =============================================================================

interface PublicCreatorStats {
  twitter_username: string;
  total_arc_points: number;
  total_arenas: number;
  total_smart_followers: number | null;
  smart_followers_pct: number | null;
  average_ct_heat: number | null;
  average_noise: number | null; // Currently not available
  average_signal: number | null;
  average_signal_score: number | null;
  most_common_trust_band: string | null;
  engagement_types: {
    threader: number;
    video: number;
    clipper: number;
    meme: number;
  };
}

type PublicStatsResponse =
  | { ok: true; stats: PublicCreatorStats }
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
  res: NextApiResponse<PublicStatsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { twitterUsername } = req.query;

  if (!twitterUsername || typeof twitterUsername !== 'string') {
    return res.status(400).json({ ok: false, error: 'Twitter username is required' });
  }

  try {
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
          project_id,
          projects!inner (
            id
          )
        )
      `)
      .ilike('twitter_username', normalizedUsername);

    if (arenaError) {
      console.error('[PublicStats] Error fetching arenas:', arenaError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch creator data' });
    }

    if (!arenaCreators || arenaCreators.length === 0) {
      return res.status(404).json({ ok: false, error: 'Creator not found in any arenas' });
    }

    // Calculate totals
    const totalArcPoints = arenaCreators.reduce((sum, ac) => sum + (Number(ac.arc_points) || 0), 0);
    const uniqueArenas = new Set(arenaCreators.map((ac: any) => ac.arena_id));
    const totalArenas = uniqueArenas.size;

    // Get all contributions for engagement type classification
    const projectIds = [...new Set(arenaCreators.map((ac: any) => ac.arenas?.projects?.id).filter(Boolean))];
    
    const { data: contributions, error: contribError } = await supabase
      .from('project_tweets')
      .select('project_id, text')
      .in('project_id', projectIds)
      .or('is_official.is.null,is_official.eq.false')
      .ilike('author_handle', normalizedUsername);

    const engagementTypes = { threader: 0, video: 0, clipper: 0, meme: 0 };
    if (contributions) {
      for (const contrib of contributions) {
        const tweetType = classifyTweetType(contrib.text);
        if (tweetType) {
          engagementTypes[tweetType]++;
        }
      }
    }

    // Calculate Signal, CT Heat, Signal Score, Trust Band across all projects
    const ctHeatScores: number[] = [];
    const signalScores: number[] = [];
    const signalScoreValues: number[] = [];
    const trustBands: string[] = [];

    for (const arenaCreator of arenaCreators) {
      const arena = (arenaCreator as any).arenas;
      const project = arena?.projects;
      if (!arena || !project) continue;

      const projectId = project.id;
      
      // Get contributions for CT Heat calculation
      const projectContributions = (contributions || []).filter(c => c.project_id === projectId);
      
      // Calculate CT Heat
      if (projectContributions.length > 0) {
        const mentionsCount = projectContributions.length;
        const totalLikes = projectContributions.reduce((sum, t) => sum + (t.likes || 0), 0);
        const totalRetweets = projectContributions.reduce((sum, t) => sum + (t.retweets || 0), 0);
        const avgLikes = totalLikes / mentionsCount;
        const avgRetweets = totalRetweets / mentionsCount;
        const uniqueAuthors = 1; // Single creator
        
        const ctHeat = computeCtHeatScore(
          mentionsCount,
          avgLikes,
          avgRetweets,
          uniqueAuthors,
          0 // influencerMentions (not applicable for single creator)
        );
        
        if (ctHeat !== null) ctHeatScores.push(ctHeat);
      }
      
      // Calculate Signal Score
      const postMetrics = await buildCreatorPostMetrics(supabase, projectId, normalizedUsername, '30d');
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
            console.error('[PublicStats] Error getting smart followers:', error);
          }
        }
        
        const signalResult = calculateCreatorSignalScore(
          postMetrics,
          '30d',
          false, // isJoined
          smartFollowersCount
        );
        
        if (signalResult.signal_score !== null) {
          signalScores.push(signalResult.signal_score);
          signalScoreValues.push(signalResult.signal_score);
        }
        if (signalResult.trust_band) trustBands.push(signalResult.trust_band);
      }
    }

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
        console.error('[PublicStats] Error calculating smart followers:', error);
      }
    }

    const stats: PublicCreatorStats = {
      twitter_username: normalizedUsername,
      total_arc_points: totalArcPoints,
      total_arenas: totalArenas,
      total_smart_followers: smartFollowersCount,
      smart_followers_pct: smartFollowersPct,
      average_ct_heat: avgCtHeat,
      average_noise: null, // Noise score not available from signal score calculation
      average_signal: avgSignal,
      average_signal_score: avgSignalScore,
      most_common_trust_band: mostCommonTrustBand,
      engagement_types: engagementTypes,
    };

    return res.status(200).json({ ok: true, stats });
  } catch (error: any) {
    console.error('[PublicStats] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}
