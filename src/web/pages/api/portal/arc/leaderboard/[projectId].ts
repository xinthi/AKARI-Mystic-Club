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
import { getSmartFollowers } from '../../../../../../../server/smart-followers/calculate';
import { calculateCreatorSignalScore, type CreatorPostMetrics } from '../../../../../../../server/arc/signal-score';

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
 */
async function calculateAutoTrackedPoints(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  projectId: string
): Promise<Map<string, number>> {
  // Get all mentions (non-official tweets) for this project
  const { data: mentions, error } = await supabase
    .from('project_tweets')
    .select('author_handle, likes, replies, retweets')
    .eq('project_id', projectId)
    .eq('is_official', false); // Only mentions, not official project tweets

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

  try {
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
      return res.status(500).json({ ok: false, error: 'Failed to fetch arena' });
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
      }));

    // Fetch avatar URLs from profiles and project_tweets
    const usernamesToFetch = entries.map(e => e.twitter_username);
    if (usernamesToFetch.length > 0) {
      // Try to get avatars from profiles first
      const profileIds = Array.from(joinedCreatorsMap.values())
        .map(c => c.profile_id)
        .filter(Boolean) as string[];

      if (profileIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, profile_image_url')
          .in('id', profileIds);

        if (profiles) {
          const avatarMap = new Map<string, string | null>();
          for (const profile of profiles) {
            const normalizedUsername = normalizeTwitterUsername(profile.username);
            if (normalizedUsername) {
              avatarMap.set(normalizedUsername, profile.profile_image_url || null);
            }
          }

          for (const entry of entries) {
            if (avatarMap.has(entry.twitter_username)) {
              entry.avatar_url = avatarMap.get(entry.twitter_username) || null;
            }
          }
        }
      }

      // Fallback: get avatars from project_tweets for auto-tracked users
      const usernamesWithoutAvatars = entries
        .filter(e => !e.avatar_url)
        .map(e => e.twitter_username);

      if (usernamesWithoutAvatars.length > 0) {
        // Fetch all project_tweets with avatars (no .in() filter to avoid case sensitivity issues)
        const { data: tweets } = await supabase
          .from('project_tweets')
          .select('author_handle, author_profile_image_url')
          .eq('project_id', pid)
          .not('author_profile_image_url', 'is', null)
          .limit(100);

        if (tweets) {
          // Build map keyed by normalized username (handles case/@ variations)
          const tweetAvatarMap = new Map<string, string | null>();
          for (const tweet of tweets) {
            const normalizedUsername = normalizeTwitterUsername(tweet.author_handle);
            if (normalizedUsername && tweet.author_profile_image_url) {
              // Only add if not already present (first match wins)
              if (!tweetAvatarMap.has(normalizedUsername)) {
                tweetAvatarMap.set(normalizedUsername, tweet.author_profile_image_url);
              }
            }
          }

          // Fill avatars using normalized key lookup
          for (const entry of entries) {
            if (!entry.avatar_url && tweetAvatarMap.has(entry.twitter_username)) {
              entry.avatar_url = tweetAvatarMap.get(entry.twitter_username) || null;
            }
          }
        }
      }
    }

    return res.status(200).json({
      ok: true,
      entries,
      arenaId: activeArena?.id || null,
      arenaName: activeArena?.name || null,
    });
  } catch (error: any) {
    console.error('[ARC Leaderboard] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
