/**
 * API Route: GET /api/portal/arc/leaderboard/[projectId]
 * 
 * Mindshare Leaderboard
 * Returns ranked creators including:
 * - Joined participants (explicitly joined + follow verified get multiplier)
 * - Auto-tracked participants (generated signal but didn't join)
 * 
 * Scoring:
 * - base_points: earned points from activities
 * - multiplier: 1.5x if joined AND follow verified, else 1.0x
 * - score: base_points * multiplier (final displayed score)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { getSmartFollowers } from '@/server/smart-followers/calculate';
import { calculateCreatorSignalScore, type CreatorPostMetrics } from '@/server/arc/signal-score';
import { computeCtHeatScore } from '@/server/scoring/akari';
import { taioGetUserInfo } from '@/server/twitterapiio';

// =============================================================================
// TYPES
// =============================================================================

interface LeaderboardEntry {
  twitter_username: string;
  avatar_url: string | null;
  rank: number;
  base_points: number;
  multiplier: number;
  score: number;
  is_joined: boolean;
  is_auto_tracked: boolean;
  follow_verified: boolean;
  ring: 'core' | 'momentum' | 'discovery' | null;
  joined_at: string | null;
  // Smart Followers (new)
  smart_followers_count: number | null;
  smart_followers_pct: number | null;
  // Signal Score (new)
  signal_score: number | null; // 0-100 derived signal score
  trust_band: 'A' | 'B' | 'C' | 'D' | null;
  // Contribution & CT Heat
  contribution_pct: number | null; // Percentage contribution to project mindshare
  ct_heat: number | null; // CT Heat score (0-100) for this creator
  // Delta values (in basis points - bps)
  delta7d: number | null; // Change in contribution % over 7 days (in bps)
  delta1m: number | null; // Change in contribution % over 1 month (in bps)
  delta3m: number | null; // Change in contribution % over 3 months (in bps)
}

type LeaderboardResponse =
  | { ok: true; entries: LeaderboardEntry[]; arenaId: string | null; arenaName: string | null }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Normalize twitter username: strip @, lowercase, trim
 */
function normalizeTwitterUsername(username: string | null | undefined): string {
  if (!username) return '';
  return username.toLowerCase().replace(/^@/, '').trim();
}

/**
 * Get x_user_id from username (look up in profiles or tracked_profiles)
 */
async function getXUserIdFromUsername(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  username: string
): Promise<string | null> {
  // Try profiles first
  const { data: profile } = await supabase
    .from('profiles')
    .select('twitter_id')
    .eq('username', username.toLowerCase().replace('@', '').trim())
    .maybeSingle();

  if (profile?.twitter_id) {
    return profile.twitter_id;
  }

  // Try tracked_profiles
  const { data: tracked } = await supabase
    .from('tracked_profiles')
    .select('x_user_id')
    .eq('username', username.toLowerCase().replace('@', '').trim())
    .maybeSingle();

  return tracked?.x_user_id || null;
}

/**
 * Build CreatorPostMetrics from project_tweets for a creator
 */
async function buildCreatorPostMetrics(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  projectId: string,
  username: string,
  window: '24h' | '7d' | '30d' = '7d'
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
    .eq('is_official', false)
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
      sentimentScore: tweet.sentiment_score,
      smartScore,
      audienceOrgScore,
    };
  });
}

/**
 * Calculate mindshare points from project_tweets (mentions only)
 * Points = sum of engagement (likes + replies*2 + retweets*3) for mentions
 * @param beforeDate If provided, only count tweets before this date (for historical calculations)
 */
async function calculateAutoTrackedPoints(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  projectId: string,
  beforeDate?: Date
): Promise<Map<string, number>> {
  // Get all mentions (non-official tweets) for this project
  let query = supabase
    .from('project_tweets')
    .select('author_handle, likes, replies, retweets')
    .eq('project_id', projectId)
    .eq('is_official', false); // Only mentions, not official project tweets

  // If beforeDate is provided, only count tweets before that date
  if (beforeDate) {
    query = query.lt('created_at', beforeDate.toISOString());
  }

  const { data: mentions, error } = await query;

  if (error || !mentions) {
    console.error('[ARC Leaderboard] Error fetching mentions:', error);
    return new Map();
  }

  // Aggregate points by normalized username
  const pointsMap = new Map<string, number>();
  for (const mention of mentions) {
    const normalizedUsername = normalizeTwitterUsername(mention.author_handle);
    if (!normalizedUsername) continue;

    // Calculate engagement points: likes + replies*2 + retweets*3
    const engagement = (mention.likes || 0) + (mention.replies || 0) * 2 + (mention.retweets || 0) * 3;
    const current = pointsMap.get(normalizedUsername) || 0;
    pointsMap.set(normalizedUsername, current + engagement);
  }

  return pointsMap;
}

/**
 * Calculate historical contribution percentages for a given date
 * Returns a map of username -> contribution percentage
 */
async function calculateHistoricalContributions(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  projectId: string,
  arenaId: string | null,
  historicalDate: Date
): Promise<Map<string, number>> {
  // Calculate auto-tracked points up to historical date
  const historicalAutoTrackedPoints = await calculateAutoTrackedPoints(supabase, projectId, historicalDate);

  // Get joined creators' points up to historical date
  const historicalJoinedPoints = new Map<string, number>();
  if (arenaId) {
    // Get arena creators who joined before historical date
    const { data: creators } = await supabase
      .from('arena_creators')
      .select('id, profile_id, twitter_username, arc_points, created_at')
      .eq('arena_id', arenaId)
      .lt('created_at', historicalDate.toISOString());

    if (creators) {
      for (const creator of creators) {
        const normalizedUsername = normalizeTwitterUsername(creator.twitter_username);
        if (normalizedUsername && creator.profile_id) {
          // Get adjustments up to historical date
          const { data: adjustments } = await supabase
            .from('arc_point_adjustments')
            .select('points_delta, created_at')
            .eq('arena_id', arenaId)
            .eq('creator_profile_id', creator.profile_id)
            .lt('created_at', historicalDate.toISOString());

          const adjustmentTotal = adjustments?.reduce((sum, adj) => sum + (adj.points_delta || 0), 0) || 0;
          const basePoints = (creator.arc_points || 0) + adjustmentTotal;

          // Check if follow verified up to historical date
          const { data: followVerification } = await supabase
            .from('arc_project_follows')
            .select('verified_at')
            .eq('project_id', projectId)
            .eq('twitter_username', normalizedUsername)
            .not('verified_at', 'is', null)
            .lt('verified_at', historicalDate.toISOString())
            .maybeSingle();

          const multiplier = followVerification?.verified_at ? 1.5 : 1.0;
          const score = Math.floor(basePoints * multiplier);
          historicalJoinedPoints.set(normalizedUsername, score);
        }
      }
    }
  }

  // Combine joined and auto-tracked points
  const allHistoricalPoints = new Map<string, number>();
  for (const [username, points] of historicalJoinedPoints.entries()) {
    allHistoricalPoints.set(username, points);
  }
  for (const [username, points] of historicalAutoTrackedPoints.entries()) {
    const existing = allHistoricalPoints.get(username) || 0;
    allHistoricalPoints.set(username, existing + points);
  }

  // Calculate total and contribution percentages
  const total = Array.from(allHistoricalPoints.values()).reduce((sum, p) => sum + p, 0);
  const contributions = new Map<string, number>();

  if (total > 0) {
    for (const [username, points] of allHistoricalPoints.entries()) {
      const contributionPct = (points / total) * 100;
      contributions.set(username, contributionPct);
    }
  }

  return contributions;
}

/**
 * Calculate CT Heat score for a creator based on their tweets
 */
async function calculateCreatorCtHeat(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  projectId: string,
  username: string
): Promise<number | null> {
  try {
    // Get creator's tweets for the last 7 days
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: tweets } = await supabase
      .from('project_tweets')
      .select('likes, replies, retweets')
      .eq('project_id', projectId)
      .eq('is_official', false)
      .ilike('author_handle', username.replace('@', ''))
      .gte('created_at', sevenDaysAgo.toISOString());

    if (!tweets || tweets.length === 0) {
      return null;
    }

    const mentionsCount = tweets.length;
    const totalLikes = tweets.reduce((sum, t) => sum + (t.likes || 0), 0);
    const totalRetweets = tweets.reduce((sum, t) => sum + (t.retweets || 0), 0);
    const avgLikes = totalLikes / mentionsCount;
    const avgRetweets = totalRetweets / mentionsCount;
    const uniqueAuthors = 1; // Single creator

    // Calculate CT Heat using the project-level function (adapted for creator)
    const ctHeat = computeCtHeatScore(
      mentionsCount,
      avgLikes,
      avgRetweets,
      uniqueAuthors,
      0 // influencerMentions (not applicable for single creator)
    );

    return ctHeat;
  } catch (error) {
    console.error(`[ARC Leaderboard] Error calculating CT Heat for ${username}:`, error);
    return null;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LeaderboardResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Check Twitter API key configuration at the start (declare outside try block)
  const twitterApiKey = process.env.TWITTERAPIIO_API_KEY;

  try {
    if (twitterApiKey) {
      console.log(`[ARC Leaderboard] ✓ Twitter API key is configured (length: ${twitterApiKey.length} chars)`);
      
      // Quick test: Try fetching one user to verify API is working
      const testUsername = '0x_jhayy'; // Already clean, no @ symbol
      try {
        console.log(`[ARC Leaderboard] Testing Twitter API with username: ${testUsername}...`);
        const testStartTime = Date.now();
        // Ensure no @ symbol is passed to API
        const cleanTestUsername = testUsername.replace(/^@+/, '').trim();
        const testUserInfo = await taioGetUserInfo(cleanTestUsername);
        const testElapsed = Date.now() - testStartTime;
        
        if (testUserInfo && testUserInfo.profileImageUrl) {
          console.log(`[ARC Leaderboard] ✓ Twitter API test SUCCESSFUL for ${testUsername} (${testElapsed}ms)`);
          console.log(`[ARC Leaderboard]   Profile Image: ${testUserInfo.profileImageUrl.substring(0, 60)}...`);
        } else {
          console.warn(`[ARC Leaderboard] ⚠ Twitter API test returned null for ${testUsername} (${testElapsed}ms)`);
        }
      } catch (testError: any) {
        console.error(`[ARC Leaderboard] ❌ Twitter API test FAILED:`, testError.message);
      }
    } else {
      console.error(`[ARC Leaderboard] ❌ Twitter API key is NOT configured - avatar fetching will be limited to database sources only`);
      console.error(`[ARC Leaderboard] To enable Twitter API avatar fetching, set TWITTERAPIIO_API_KEY in your environment variables`);
    }
    
    // Authentication
    const portalUser = await requirePortalUser(req, res);
    if (!portalUser) {
      return; // requirePortalUser already sent 401 response
    }

    const supabase = getSupabaseAdmin();

    // Get projectId from query
    const { projectId } = req.query;
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    const pid: string = projectId;

    // Check ARC access (Option 2 = Normal Leaderboard)
    const accessCheck = await requireArcAccess(supabase, pid, 2);
    if (!accessCheck.ok) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error,
      });
    }

    // Calculate auto-tracked points from project_tweets (mentions)
    const autoTrackedPoints = await calculateAutoTrackedPoints(supabase, pid);

    // Find active arena for this project
    const { data: activeArena, error: arenaError } = await supabase
      .from('arenas')
      .select('id, name, slug')
      .eq('project_id', pid)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (arenaError) {
      console.error('[ARC Leaderboard] Error fetching arena:', arenaError);
      return res.status(500).json({ ok: false, error: 'Unable to load arena. Please try again later.' });
    }

    // Get joined creators (if arena exists)
    const joinedCreatorsMap = new Map<string, {
      profile_id: string | null;
      arc_points: number;
      ring: string | null;
      joined_at: string | null;
    }>();

    const adjustmentsMap = new Map<string, number>();

    if (activeArena) {
      // Get all creators for this arena
      const { data: creators, error: creatorsError } = await supabase
        .from('arena_creators')
        .select('id, profile_id, twitter_username, arc_points, ring, created_at')
        .eq('arena_id', activeArena.id);

      if (creatorsError) {
        console.error('[ARC Leaderboard] Error fetching creators:', creatorsError);
        // Continue without joined creators
      } else if (creators) {
        for (const creator of creators) {
          const normalizedUsername = normalizeTwitterUsername(creator.twitter_username);
          if (normalizedUsername) {
            joinedCreatorsMap.set(normalizedUsername, {
              profile_id: creator.profile_id || null,
              arc_points: Number(creator.arc_points) || 0,
              ring: creator.ring as string | null,
              joined_at: creator.created_at || null,
            });
          }
        }
      }

      // Get all adjustments for this arena
      const { data: adjustments, error: adjustmentsError } = await supabase
        .from('arc_point_adjustments')
        .select('creator_profile_id, points_delta')
        .eq('arena_id', activeArena.id);

      if (adjustmentsError) {
        console.error('[ARC Leaderboard] Error fetching adjustments:', adjustmentsError);
        // Continue without adjustments
      } else if (adjustments) {
        for (const adj of adjustments) {
          const profileId = adj.creator_profile_id;
          const current = adjustmentsMap.get(profileId) || 0;
          adjustmentsMap.set(profileId, current + (adj.points_delta || 0));
        }
      }
    }

    // Get follow verification status for all joined creators
    const followVerifiedMap = new Map<string, boolean>();
    if (joinedCreatorsMap.size > 0) {
      const joinedUsernames = Array.from(joinedCreatorsMap.keys());
      const { data: followVerifications } = await supabase
        .from('arc_project_follows')
        .select('twitter_username, verified_at')
        .eq('project_id', pid)
        .in('twitter_username', joinedUsernames);

      if (followVerifications) {
        for (const verification of followVerifications) {
          const normalizedUsername = normalizeTwitterUsername(verification.twitter_username);
          if (normalizedUsername && verification.verified_at) {
            followVerifiedMap.set(normalizedUsername, true);
          }
        }
      }
    }

    // Build combined leaderboard entries
    const entriesMap = new Map<string, LeaderboardEntry>();

    // 1. Add joined creators
    for (const [username, creator] of joinedCreatorsMap.entries()) {
      const profileId = creator.profile_id || '';
      const basePoints = creator.arc_points + (adjustmentsMap.get(profileId) || 0);
      const followVerified = followVerifiedMap.get(username) || false;
      const multiplier = followVerified ? 1.5 : 1.0;
      const score = Math.floor(basePoints * multiplier);

      // Get Smart Followers and Signal Score
      let smartFollowersCount: number | null = null;
      let smartFollowersPct: number | null = null;
      let signalScore: number | null = null;
      let trustBand: 'A' | 'B' | 'C' | 'D' | null = null;

      try {
        const xUserId = await getXUserIdFromUsername(supabase, username);
        if (xUserId) {
          const smartFollowers = await getSmartFollowers(
            supabase,
            'creator',
            xUserId,
            xUserId,
            new Date()
          );
          smartFollowersCount = smartFollowers.smart_followers_count;
          smartFollowersPct = smartFollowers.smart_followers_pct;

          // Calculate Signal Score
          const postMetrics = await buildCreatorPostMetrics(supabase, pid, username, '7d');
          if (postMetrics.length > 0) {
            const signalResult = calculateCreatorSignalScore(
              postMetrics,
              '7d',
              true, // isJoined
              smartFollowersCount || 0
            );
            signalScore = signalResult.signal_score;
            trustBand = signalResult.trust_band;
          }
        }
      } catch (error) {
        console.error(`[ARC Leaderboard] Error calculating Smart Followers/Signal Score for ${username}:`, error);
        // Continue with null values
      }

      entriesMap.set(username, {
        twitter_username: username,
        avatar_url: null, // Will be populated later
        rank: 0, // Will be set after sorting
        base_points: basePoints,
        multiplier,
        score,
        is_joined: true,
        is_auto_tracked: false,
        follow_verified: followVerified,
        ring: creator.ring as 'core' | 'momentum' | 'discovery' | null,
        joined_at: creator.joined_at,
        smart_followers_count: smartFollowersCount,
        smart_followers_pct: smartFollowersPct,
        signal_score: signalScore,
        trust_band: trustBand,
        contribution_pct: null, // Will be calculated after sorting
        ct_heat: null, // Will be calculated after sorting
        delta7d: null, // Will be calculated after sorting
        delta1m: null, // Will be calculated after sorting
        delta3m: null, // Will be calculated after sorting
      });
    }

    // 2. Add auto-tracked creators (if not already joined)
    for (const [username, points] of autoTrackedPoints.entries()) {
      if (!entriesMap.has(username) && points > 0) {
        // Get Smart Followers and Signal Score for auto-tracked creators
        let smartFollowersCount: number | null = null;
        let smartFollowersPct: number | null = null;
        let signalScore: number | null = null;
        let trustBand: 'A' | 'B' | 'C' | 'D' | null = null;

        try {
          const xUserId = await getXUserIdFromUsername(supabase, username);
          if (xUserId) {
            const smartFollowers = await getSmartFollowers(
              supabase,
              'creator',
              xUserId,
              xUserId,
              new Date()
            );
            smartFollowersCount = smartFollowers.smart_followers_count;
            smartFollowersPct = smartFollowers.smart_followers_pct;

            // Calculate Signal Score
            const postMetrics = await buildCreatorPostMetrics(supabase, pid, username, '7d');
            if (postMetrics.length > 0) {
              const signalResult = calculateCreatorSignalScore(
                postMetrics,
                '7d',
                false, // isJoined
                smartFollowersCount || 0
              );
              signalScore = signalResult.signal_score;
              trustBand = signalResult.trust_band;
            }
          }
        } catch (error) {
          console.error(`[ARC Leaderboard] Error calculating Smart Followers/Signal Score for ${username}:`, error);
          // Continue with null values
        }

        entriesMap.set(username, {
          twitter_username: username,
          avatar_url: null,
          rank: 0,
          base_points: points,
          multiplier: 1.0,
          score: points,
          is_joined: false,
          is_auto_tracked: true,
          follow_verified: false,
          ring: null,
          joined_at: null,
          smart_followers_count: smartFollowersCount,
          smart_followers_pct: smartFollowersPct,
          signal_score: signalScore,
          trust_band: trustBand,
          contribution_pct: null, // Will be calculated after sorting
          ct_heat: null, // Will be calculated after sorting
          delta7d: null, // Will be calculated after sorting
          delta1m: null, // Will be calculated after sorting
          delta3m: null, // Will be calculated after sorting
        });
      } else if (entriesMap.has(username)) {
        // If already joined, add auto-tracked points to base_points
        const entry = entriesMap.get(username)!;
        entry.base_points += points;
        entry.score = Math.floor(entry.base_points * entry.multiplier);
      }
    }

    // Convert to array, sort by score DESC, assign ranks
    const entries: LeaderboardEntry[] = Array.from(entriesMap.values())
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
        contribution_pct: null, // Will be calculated after we have total
        ct_heat: null, // Will be calculated per creator
        // Delta fields are already set to null in entriesMap, preserved by spread
      }));

    // Calculate total project mindshare (sum of all scores)
    const totalMindshare = entries.reduce((sum, entry) => sum + entry.score, 0);

    // Calculate historical contribution percentages for delta calculations
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Calculate historical contributions in parallel
    const [historical7d, historical1m, historical3m] = await Promise.all([
      calculateHistoricalContributions(supabase, pid, activeArena?.id || null, sevenDaysAgo),
      calculateHistoricalContributions(supabase, pid, activeArena?.id || null, oneMonthAgo),
      calculateHistoricalContributions(supabase, pid, activeArena?.id || null, threeMonthsAgo),
    ]);

    // Calculate contribution percentage, CT Heat, and deltas for each entry
    for (const entry of entries) {
      // Contribution percentage
      if (totalMindshare > 0) {
        entry.contribution_pct = (entry.score / totalMindshare) * 100;
      } else {
        entry.contribution_pct = null;
      }

      // Calculate deltas (in basis points: 1% = 100 bps)
      const currentPct = entry.contribution_pct || 0;
      
      const historical7dPct = historical7d.get(entry.twitter_username) || 0;
      entry.delta7d = currentPct > 0 || historical7dPct > 0 
        ? Math.round((currentPct - historical7dPct) * 100) // Convert % to bps
        : null;

      const historical1mPct = historical1m.get(entry.twitter_username) || 0;
      entry.delta1m = currentPct > 0 || historical1mPct > 0
        ? Math.round((currentPct - historical1mPct) * 100) // Convert % to bps
        : null;

      const historical3mPct = historical3m.get(entry.twitter_username) || 0;
      entry.delta3m = currentPct > 0 || historical3mPct > 0
        ? Math.round((currentPct - historical3mPct) * 100) // Convert % to bps
        : null;

      // CT Heat (calculate for all entries)
      try {
        const ctHeat = await calculateCreatorCtHeat(supabase, pid, entry.twitter_username);
        entry.ct_heat = ctHeat;
      } catch (error) {
        console.error(`[ARC Leaderboard] Error calculating CT Heat for ${entry.twitter_username}:`, error);
        entry.ct_heat = null;
      }
      
      // Ensure smart_followers fields are set (they should already be set, but double-check)
      if (entry.smart_followers_count === undefined) {
        entry.smart_followers_count = null;
      }
      if (entry.smart_followers_pct === undefined) {
        entry.smart_followers_pct = null;
      }
    }

    // Fetch avatar URLs from multiple sources
    // Priority: project_tweets (most recent) -> profiles -> tracked_profiles -> Twitter API
    const avatarMap = new Map<string, string | null>();
    
    // Step 1: Get avatars from project_tweets FIRST (most likely to have current avatars)
    // Fetch ALL tweets with avatars for this project (ordered by most recent first)
    // This ensures we get the most up-to-date avatars
    const { data: tweets, error: tweetsError } = await supabase
      .from('project_tweets')
      .select('author_handle, author_profile_image_url')
      .eq('project_id', pid)
      .not('author_profile_image_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5000); // Limit to prevent huge queries, but get enough to cover all creators

    if (tweetsError) {
      console.warn(`[ARC Leaderboard] Error fetching tweets for avatars:`, tweetsError);
    }

    if (tweets && tweets.length > 0) {
      console.log(`[ARC Leaderboard] Found ${tweets.length} tweets with avatars from project_tweets`);
      let addedFromTweets = 0;
      for (const tweet of tweets) {
        if (tweet.author_handle && tweet.author_profile_image_url) {
          // Validate URL before using
          const avatarUrl = typeof tweet.author_profile_image_url === 'string' 
            ? tweet.author_profile_image_url.trim() 
            : null;
          
          if (avatarUrl && avatarUrl.length > 0 && avatarUrl.startsWith('http')) {
            const normalizedUsername = normalizeTwitterUsername(tweet.author_handle);
            if (normalizedUsername) {
              // Only add if not already present (first match wins, ordered by most recent)
              if (!avatarMap.has(normalizedUsername)) {
                avatarMap.set(normalizedUsername, avatarUrl);
                addedFromTweets++;
              }
            }
          }
        }
      }
      console.log(`[ARC Leaderboard] Extracted ${addedFromTweets} new unique avatars from project_tweets (total in map: ${avatarMap.size})`);
    } else {
      console.log(`[ARC Leaderboard] No tweets found with avatars for project ${pid}`);
    }

    // Step 2: Get avatars from profiles table (for creators who have profiles)
    const allUsernames = entries.map(e => normalizeTwitterUsername(e.twitter_username)).filter(Boolean) as string[];
    const missingFromTweets = allUsernames.filter(u => !avatarMap.has(u));

    if (missingFromTweets.length > 0) {
      // Try batch query first - query all missing usernames at once
      // Split into chunks if too many (PostgreSQL IN clause limit)
      const chunkSize = 100;
      for (let i = 0; i < missingFromTweets.length; i += chunkSize) {
        const chunk = missingFromTweets.slice(i, i + chunkSize);
        
        // Query with original case
        const { data: profiles } = await supabase
          .from('profiles')
          .select('username, profile_image_url')
          .in('username', chunk)
          .not('profile_image_url', 'is', null);

        if (profiles && profiles.length > 0) {
          for (const profile of profiles) {
            if (profile.username && profile.profile_image_url) {
              const avatarUrl = typeof profile.profile_image_url === 'string' 
                ? profile.profile_image_url.trim() 
                : null;
              
              if (avatarUrl && avatarUrl.length > 0 && avatarUrl.startsWith('http')) {
                const normalizedUsername = normalizeTwitterUsername(profile.username);
                if (normalizedUsername && !avatarMap.has(normalizedUsername)) {
                  avatarMap.set(normalizedUsername, avatarUrl);
                }
              }
            }
          }
        }

        // Also try lowercase variations
        const { data: profilesLower } = await supabase
          .from('profiles')
          .select('username, profile_image_url')
          .in('username', chunk.map(u => u.toLowerCase()))
          .not('profile_image_url', 'is', null);

        if (profilesLower && profilesLower.length > 0) {
          for (const profile of profilesLower) {
            if (profile.username && profile.profile_image_url) {
              const avatarUrl = typeof profile.profile_image_url === 'string' 
                ? profile.profile_image_url.trim() 
                : null;
              
              if (avatarUrl && avatarUrl.length > 0 && avatarUrl.startsWith('http')) {
                const normalizedUsername = normalizeTwitterUsername(profile.username);
                if (normalizedUsername && !avatarMap.has(normalizedUsername)) {
                  avatarMap.set(normalizedUsername, avatarUrl);
                }
              }
            }
          }
        }

        // Also try with @ prefix variations
        const chunkWithAt = chunk.map(u => `@${u}`);
        const { data: profilesWithAt } = await supabase
          .from('profiles')
          .select('username, profile_image_url')
          .in('username', chunkWithAt)
          .not('profile_image_url', 'is', null);

        if (profilesWithAt && profilesWithAt.length > 0) {
          for (const profile of profilesWithAt) {
            if (profile.username && profile.profile_image_url) {
              const avatarUrl = typeof profile.profile_image_url === 'string' 
                ? profile.profile_image_url.trim() 
                : null;
              
              if (avatarUrl && avatarUrl.length > 0 && avatarUrl.startsWith('http')) {
                const normalizedUsername = normalizeTwitterUsername(profile.username);
                if (normalizedUsername && !avatarMap.has(normalizedUsername)) {
                  avatarMap.set(normalizedUsername, avatarUrl);
                }
              }
            }
          }
        }
      }

      // Step 2b: Also try by profile_id for joined creators
      const profileIds = Array.from(joinedCreatorsMap.values())
        .map(c => c.profile_id)
        .filter(Boolean) as string[];

      if (profileIds.length > 0) {
        const { data: profilesById } = await supabase
          .from('profiles')
          .select('id, username, profile_image_url')
          .in('id', profileIds)
          .not('profile_image_url', 'is', null);

        if (profilesById) {
          for (const profile of profilesById) {
            if (profile.username && profile.profile_image_url) {
              const avatarUrl = typeof profile.profile_image_url === 'string' 
                ? profile.profile_image_url.trim() 
                : null;
              
              if (avatarUrl && avatarUrl.length > 0 && avatarUrl.startsWith('http')) {
            const normalizedUsername = normalizeTwitterUsername(profile.username);
                if (normalizedUsername && !avatarMap.has(normalizedUsername)) {
                  avatarMap.set(normalizedUsername, avatarUrl);
                }
              }
            }
          }
        }
      }
    }

    // Step 3: Fallback to tracked_profiles
    const finalMissing = allUsernames.filter(u => !avatarMap.has(u));
    if (finalMissing.length > 0) {
      // Query tracked_profiles with lowercase usernames
      const { data: trackedProfiles } = await supabase
        .from('tracked_profiles')
        .select('username, profile_image_url')
        .in('username', finalMissing.map(u => u.toLowerCase()))
        .not('profile_image_url', 'is', null);

      if (trackedProfiles) {
        for (const profile of trackedProfiles) {
          if (profile.username && profile.profile_image_url) {
            const avatarUrl = typeof profile.profile_image_url === 'string' 
              ? profile.profile_image_url.trim() 
              : null;
            
            if (avatarUrl && avatarUrl.length > 0 && avatarUrl.startsWith('http')) {
              const normalizedUsername = normalizeTwitterUsername(profile.username);
              if (normalizedUsername && !avatarMap.has(normalizedUsername)) {
                avatarMap.set(normalizedUsername, avatarUrl);
              }
            }
          }
        }
      }

      // Also try without lowercase conversion (in case stored with case)
      const { data: trackedProfilesCase } = await supabase
        .from('tracked_profiles')
        .select('username, profile_image_url')
        .in('username', finalMissing)
        .not('profile_image_url', 'is', null);

      if (trackedProfilesCase) {
        for (const profile of trackedProfilesCase) {
          if (profile.username && profile.profile_image_url) {
            const avatarUrl = typeof profile.profile_image_url === 'string' 
              ? profile.profile_image_url.trim() 
              : null;
            
            if (avatarUrl && avatarUrl.length > 0 && avatarUrl.startsWith('http')) {
              const normalizedUsername = normalizeTwitterUsername(profile.username);
              if (normalizedUsername && !avatarMap.has(normalizedUsername)) {
                avatarMap.set(normalizedUsername, avatarUrl);
              }
            }
          }
        }
      }
    }

    // Now assign avatars to entries from avatarMap
    let assignedFromMap = 0;
          for (const entry of entries) {
      const normalizedEntryUsername = normalizeTwitterUsername(entry.twitter_username);
      if (normalizedEntryUsername && avatarMap.has(normalizedEntryUsername)) {
        const avatarUrl = avatarMap.get(normalizedEntryUsername);
        if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim().length > 0 && avatarUrl.startsWith('http')) {
          entry.avatar_url = avatarUrl;
          assignedFromMap++;
        } else {
          entry.avatar_url = null;
        }
      } else {
        // Ensure it's explicitly null if not found
        entry.avatar_url = null;
      }
    }
    console.log(`[ARC Leaderboard] Assigned ${assignedFromMap} avatars from avatarMap to entries`);

    // Step 4: Final fallback - fetch from Twitter API for remaining missing avatars
    // Fetch for all missing avatars in batches to avoid rate limits
    const stillMissingAvatars = entries.filter((e: LeaderboardEntry) => 
      !e.avatar_url || 
      typeof e.avatar_url !== 'string' || 
      e.avatar_url.trim().length === 0 ||
      !e.avatar_url.startsWith('http')
    );
    console.log(`[ARC Leaderboard] Fetching avatars from Twitter API for ${stillMissingAvatars.length} missing entries`);
    if (stillMissingAvatars.length > 0 && stillMissingAvatars.length <= 10) {
      console.log(`[ARC Leaderboard] Missing avatars for: ${stillMissingAvatars.map(e => e.twitter_username).join(', ')}`);
    }
    
    // Check if Twitter API is configured (twitterApiKey already declared at the start of handler)
    if (!twitterApiKey) {
      console.error(`[ARC Leaderboard] ❌ ERROR: TWITTERAPIIO_API_KEY is not configured. Twitter API fallback will not work.`);
      console.error(`[ARC Leaderboard] Please set TWITTERAPIIO_API_KEY in your environment variables to enable avatar fetching.`);
    } else {
      console.log(`[ARC Leaderboard] ✓ Twitter API key is configured. Will fetch avatars for all missing profiles.`);
    }
    
    // Helper function to validate and set avatar URL
    const setAvatarIfValid = (entry: LeaderboardEntry, url: string | null | undefined, source: string) => {
      if (url && typeof url === 'string' && url.trim().length > 0 && url.startsWith('http')) {
        const normalizedUsername = normalizeTwitterUsername(entry.twitter_username);
        entry.avatar_url = url;
        if (normalizedUsername) {
          avatarMap.set(normalizedUsername, url);
        }
        console.log(`[ARC Leaderboard] ✓ Set avatar for ${entry.twitter_username} from ${source}`);
        return true;
      }
      return false;
    };

    // Helper function to try fetching with retry and multiple username variations
    const fetchAvatarWithRetry = async (entry: LeaderboardEntry, maxRetries = 1): Promise<string | null> => {
      // Always remove @ symbol - Twitter API doesn't accept it
      const normalizedUsername = normalizeTwitterUsername(entry.twitter_username);
      const originalUsername = entry.twitter_username.replace(/^@+/, '').trim();
      
      // Try username variations WITHOUT @ symbol (Twitter API doesn't accept @)
      const usernameVariations = [
        normalizedUsername,
        originalUsername,
      ].filter((u, i, arr) => u && u.length > 0 && arr.indexOf(u) === i); // Remove duplicates and empty strings
      
      for (const username of usernameVariations) {
        if (!username || username.length === 0) continue;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              // Wait before retry (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, 300 * attempt));
            }
            
            // Twitter API expects username WITHOUT @ symbol
            const cleanUsername = username.replace(/^@+/, '').trim();
            if (!cleanUsername) continue;
            
            const userInfo = await taioGetUserInfo(cleanUsername);
            if (userInfo && userInfo.profileImageUrl && 
                typeof userInfo.profileImageUrl === 'string' && 
                userInfo.profileImageUrl.trim().length > 0 &&
                userInfo.profileImageUrl.startsWith('http')) {
              return userInfo.profileImageUrl;
            }
          } catch (error: any) {
            // Log error but continue trying other variations
            if (attempt === maxRetries) {
              console.warn(`[ARC Leaderboard] Failed to fetch avatar for ${username} after ${maxRetries + 1} attempts:`, error?.message || error);
            }
          }
        }
      }
      
      return null;
    };
    
    if (stillMissingAvatars.length > 0 && twitterApiKey) {
      console.log(`[ARC Leaderboard] ========================================`);
      console.log(`[ARC Leaderboard] Starting Twitter API fetch for ALL ${stillMissingAvatars.length} missing avatars...`);
      console.log(`[ARC Leaderboard] This may take a while, but will fetch avatars for ALL profiles.`);
      console.log(`[ARC Leaderboard] ========================================`);
      
      let totalFetched = 0;
      let totalFailed = 0;
      const startTime = Date.now();
      
      // Process ALL missing avatars (not just top 50)
      for (let i = 0; i < stillMissingAvatars.length; i++) {
        const entry = stillMissingAvatars[i];
        const progress = `[${i + 1}/${stillMissingAvatars.length}]`;
        
        try {
          console.log(`[ARC Leaderboard] ${progress} Fetching avatar for ${entry.twitter_username}...`);
          const avatarUrl = await fetchAvatarWithRetry(entry, 1); // 1 retry for speed
          if (avatarUrl) {
            const success = setAvatarIfValid(entry, avatarUrl, 'Twitter API');
            if (success) {
              totalFetched++;
              console.log(`[ARC Leaderboard] ${progress} ✓ Successfully fetched avatar for ${entry.twitter_username}`);
              
              // Cache to database (async, don't await)
              (async () => {
                try {
                  const normalizedUsername = normalizeTwitterUsername(entry.twitter_username);
                  if (normalizedUsername) {
                    // Don't fetch userInfo again - we already have it from fetchAvatarWithRetry
                    // Just cache the avatar URL we already fetched
                    await supabase
                      .from('profiles')
                      .upsert({
                        username: normalizedUsername,
                        profile_image_url: avatarUrl,
                        updated_at: new Date().toISOString(),
                      }, {
                        onConflict: 'username',
                        ignoreDuplicates: false,
                      });
                    console.log(`[ARC Leaderboard] ${progress} ✓ Cached avatar for ${normalizedUsername} to database`);
                  }
                } catch (err) {
                  // Silently fail - caching is not critical
                  console.warn(`[ARC Leaderboard] ${progress} Failed to cache avatar for ${entry.twitter_username}:`, err);
                }
              })();
            } else {
              totalFailed++;
              console.warn(`[ARC Leaderboard] ${progress} ✗ Avatar URL validation failed for ${entry.twitter_username}`);
            }
          } else {
            totalFailed++;
            console.warn(`[ARC Leaderboard] ${progress} ✗ Could not fetch avatar for ${entry.twitter_username} from Twitter API (returned null)`);
          }
        } catch (error) {
          totalFailed++;
          console.warn(`[ARC Leaderboard] ${progress} ✗ Error fetching avatar for ${entry.twitter_username}:`, error);
        }
        
        // Small delay between requests to avoid rate limits (except for last one)
        if (i < stillMissingAvatars.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between requests
        }
        
        // Log progress every 10 entries
        if ((i + 1) % 10 === 0) {
          const elapsed = Date.now() - startTime;
          const avgTime = elapsed / (i + 1);
          const remaining = stillMissingAvatars.length - (i + 1);
          const estimatedTimeLeft = Math.round((remaining * avgTime) / 1000);
          console.log(`[ARC Leaderboard] Progress: ${i + 1}/${stillMissingAvatars.length} processed. ${totalFetched} succeeded, ${totalFailed} failed. Estimated time left: ~${estimatedTimeLeft}s`);
        }
      }
      
      // Verify avatars were set after Twitter API calls
      const afterTwitterAvatars = entries.filter((e: LeaderboardEntry) => 
        e.avatar_url && 
        typeof e.avatar_url === 'string' && 
        e.avatar_url.trim().length > 0 &&
        e.avatar_url.startsWith('http')
      ).length;
      const totalTime = Date.now() - startTime;
      console.log(`[ARC Leaderboard] ========================================`);
      console.log(`[ARC Leaderboard] Twitter API fetch completed in ${Math.round(totalTime / 1000)}s`);
      console.log(`[ARC Leaderboard] Total entries with avatars: ${afterTwitterAvatars}/${entries.length}`);
      console.log(`[ARC Leaderboard] Successfully fetched: ${totalFetched} new avatars`);
      console.log(`[ARC Leaderboard] Failed to fetch: ${totalFailed} avatars`);
      console.log(`[ARC Leaderboard] ========================================`);
    } else if (stillMissingAvatars.length > 0 && !twitterApiKey) {
      console.error(`[ARC Leaderboard] ❌ Cannot fetch avatars - TWITTERAPIIO_API_KEY is not configured.`);
      console.error(`[ARC Leaderboard] ${stillMissingAvatars.length} entries will have no avatars.`);
      console.error(`[ARC Leaderboard] Please set TWITTERAPIIO_API_KEY in your environment variables.`);
    }

    // Final check: Log how many entries have avatars for debugging
    // Also ensure all entries have avatar_url explicitly set (even if null)
          for (const entry of entries) {
      if (entry.avatar_url === undefined) {
        entry.avatar_url = null;
      }
    }
    
    const entriesWithAvatars = entries.filter((e: LeaderboardEntry) => 
      e.avatar_url !== null && 
      e.avatar_url !== undefined && 
      typeof e.avatar_url === 'string' && 
      e.avatar_url.trim().length > 0 &&
      e.avatar_url.startsWith('http')
    ).length;
    const missingAvatars = entries.filter((e: LeaderboardEntry) => 
      !e.avatar_url || 
      typeof e.avatar_url !== 'string' || 
      e.avatar_url.trim().length === 0 ||
      !e.avatar_url.startsWith('http')
    ).map(e => e.twitter_username).slice(0, 20);
    
    // Log first 5 entries with their avatar status for debugging
    console.log(`[ARC Leaderboard] ========================================`);
    console.log(`[ARC Leaderboard] Avatar Fetching Summary:`);
    console.log(`[ARC Leaderboard] Total entries: ${entries.length}`);
    console.log(`[ARC Leaderboard] Entries with valid avatars: ${entriesWithAvatars}`);
    console.log(`[ARC Leaderboard] Entries missing avatars: ${entries.length - entriesWithAvatars}`);
    if (missingAvatars.length > 0) {
      console.log(`[ARC Leaderboard] Missing avatars for: ${missingAvatars.join(', ')}${missingAvatars.length < entries.length - entriesWithAvatars ? '...' : ''}`);
    }
    console.log(`[ARC Leaderboard] First 5 entries avatar status:`);
    entries.slice(0, 5).forEach((entry, idx) => {
      console.log(`[ARC Leaderboard]   ${idx + 1}. ${entry.twitter_username}: ${entry.avatar_url ? '✓ ' + entry.avatar_url.substring(0, 50) + '...' : '✗ MISSING'}`);
    });
    console.log(`[ARC Leaderboard] ========================================`);

    // Final verification: Ensure all entries have avatar_url field and log sample
    // Also create a clean copy to ensure proper serialization
    // IMPORTANT: Don't filter out invalid URLs here - let frontend handle it
    // Just ensure the field exists and is a string or null
    const finalEntries: LeaderboardEntry[] = entries.map((entry) => {
      // Ensure avatar_url is always a string or null (never undefined)
      let avatarUrl: string | null = null;
      if (entry.avatar_url) {
        if (typeof entry.avatar_url === 'string' && entry.avatar_url.trim().length > 0) {
          avatarUrl = entry.avatar_url.trim();
        }
      }
      
      return {
        ...entry,
        avatar_url: avatarUrl,
      };
    });
    
    const finalEntriesWithAvatars = finalEntries.filter((e: LeaderboardEntry) => 
      e.avatar_url && 
      typeof e.avatar_url === 'string' && 
      e.avatar_url.trim().length > 0 &&
      e.avatar_url.startsWith('http')
    ).length;
    
    console.log(`[ARC Leaderboard] ========================================`);
    console.log(`[ARC Leaderboard] FINAL RESPONSE PREPARATION:`);
    console.log(`[ARC Leaderboard] Total entries to return: ${finalEntries.length}`);
    console.log(`[ARC Leaderboard] Entries with valid avatars: ${finalEntriesWithAvatars}`);
    console.log(`[ARC Leaderboard] Sample of first 5 entries being returned:`);
    finalEntries.slice(0, 5).forEach((entry, idx) => {
      const avatarPreview = entry.avatar_url 
        ? entry.avatar_url.substring(0, 60) + '...' 
        : 'NULL';
      console.log(`[ARC Leaderboard]   Entry ${idx + 1}: username="${entry.twitter_username}", avatar_url="${avatarPreview}"`);
    });
    console.log(`[ARC Leaderboard] ========================================`);

    return res.status(200).json({
      ok: true,
      entries: finalEntries, // Use cleaned entries
      arenaId: activeArena?.id || null,
      arenaName: activeArena?.name || null,
    });
  } catch (error: any) {
    console.error('[ARC Leaderboard] Error:', error);
    return res.status(500).json({ ok: false, error: 'Unable to load leaderboard. Please try again later.' });
  }
}
