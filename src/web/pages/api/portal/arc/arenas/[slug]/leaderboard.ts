/**
 * API Route: GET /api/portal/arc/arenas/[slug]/leaderboard
 * 
 * Paginated leaderboard for an arena
 * Fetches from project_tweets/sentiment with follow multiplier
 * Supports pagination (100 per page)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { requirePortalUser } from '@/lib/server/require-portal-user';

interface LeaderboardEntry {
  rank: number;
  twitter_username: string;
  avatar_url: string | null;
  base_points: number;
  multiplier: number;
  score: number;
  is_joined: boolean;
  follow_verified: boolean;
  ring: 'core' | 'momentum' | 'discovery' | null;
  joined_at: string | null;
}

type LeaderboardResponse =
  | { 
      ok: true; 
      entries: LeaderboardEntry[]; 
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      visibility?: string;
      isInvited?: boolean;
      isApproved?: boolean;
      utmLink?: string | null;
      message?: string;
    }
  | { ok: false; error: string };

function normalizeTwitterUsername(username: string | null | undefined): string {
  if (!username) return '';
  return username.toLowerCase().replace(/^@/, '').trim();
}

/**
 * Calculate points from project_tweets (mentions only)
 * Points = sum of engagement (likes + replies*2 + retweets*3) for mentions
 */
async function calculateAutoTrackedPoints(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  projectId: string
): Promise<Map<string, { basePoints: number; tweetCount: number }>> {
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
  const pointsMap = new Map<string, { basePoints: number; tweetCount: number }>();
  for (const mention of mentions) {
    const normalizedUsername = normalizeTwitterUsername(mention.author_handle);
    if (!normalizedUsername) continue;

    // Calculate engagement points: likes + replies*2 + retweets*3
    const engagement = (mention.likes || 0) + (mention.replies || 0) * 2 + (mention.retweets || 0) * 3;
    const current = pointsMap.get(normalizedUsername) || { basePoints: 0, tweetCount: 0 };
    pointsMap.set(normalizedUsername, {
      basePoints: current.basePoints + engagement,
      tweetCount: current.tweetCount + 1,
    });
  }

  return pointsMap;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LeaderboardResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const portalUser = await requirePortalUser(req, res);
    if (!portalUser) {
      return;
    }

    const supabase = getSupabaseAdmin();
    const { slug, page = '1' } = req.query;

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ ok: false, error: 'Arena slug is required' });
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const pageSize = 100;

    // Find arena by slug
    const { data: arenaData, error: arenaError } = await supabase
      .from('arenas')
      .select('id, project_id, name, slug')
      .ilike('slug', slug.trim().toLowerCase())
      .single();

    if (arenaError || !arenaData) {
      return res.status(404).json({ ok: false, error: 'Arena not found' });
    }

    // Get project to check arc_access_level
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('id, arc_access_level')
      .eq('id', arenaData.project_id)
      .single();

    if (projectError || !projectData) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    // Check if this is a CRM arena
    const isCRM = projectData.arc_access_level === 'creator_manager';
    
    // For CRM, check visibility and user participation
    let canViewLeaderboard = true;
    let visibilityInfo: { visibility: string; isInvited: boolean; isApproved: boolean; utmLink: string | null } | null = null;

    // Get current user's profile (optional - don't require auth for visibility check)
    // Declare outside if/else so it's available in both branches
    let userProfileId: string | null = null;
    try {
      // Try to get user, but don't fail if not authenticated
      const sessionToken = req.headers.cookie?.split('akari_session=')[1]?.split(';')[0] || null;
      if (sessionToken) {
        const { data: session } = await supabase
          .from('akari_user_sessions')
          .select('user_id, expires_at')
          .eq('session_token', sessionToken)
          .maybeSingle();
        
        if (session && new Date(session.expires_at) > new Date()) {
          const { data: profile } = await supabase
            .from('akari_user_identities')
            .select('profile_id')
            .eq('user_id', session.user_id)
            .single();
          userProfileId = profile?.profile_id || null;
        }
      }
    } catch (err) {
      // User not authenticated, continue with null
    }

    if (isCRM) {
      // Find associated campaign or creator_manager_program
      // First try to find arc_campaign linked to this arena/project
      const { data: campaign, error: campaignError } = await supabase
        .from('arc_campaigns')
        .select('id, leaderboard_visibility, participation_mode')
        .eq('project_id', arenaData.project_id)
        .eq('status', 'live')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (campaign && !campaignError) {
        const visibility = campaign.leaderboard_visibility;
        visibilityInfo = {
          visibility,
          isInvited: false,
          isApproved: false,
          utmLink: null,
        };

          if (userProfileId) {
            // Check if user is a participant
            const { data: participant } = await supabase
              .from('arc_campaign_participants')
              .select('id, status, arc_participant_links (code, target_url)')
              .eq('campaign_id', campaign.id)
              .eq('profile_id', userProfileId)
              .maybeSingle();

          if (participant) {
            visibilityInfo.isInvited = true;
            visibilityInfo.isApproved = participant.status === 'accepted' || participant.status === 'tracked';
            
            // Get UTM link if available
            if (participant.arc_participant_links && Array.isArray(participant.arc_participant_links) && participant.arc_participant_links.length > 0) {
              const link = participant.arc_participant_links[0];
              visibilityInfo.utmLink = `/r/${link.code}`;
            } else if (participant.arc_participant_links && !Array.isArray(participant.arc_participant_links)) {
              const link = participant.arc_participant_links as any;
              visibilityInfo.utmLink = `/r/${link.code}`;
            }
          }
        }

        // Check visibility rules
        if (visibility === 'private') {
          // Private: Only invited and approved users can see
          canViewLeaderboard = visibilityInfo.isInvited && visibilityInfo.isApproved;
        } else if (visibility === 'public') {
          // Public: Everyone can see, but may need to apply
          canViewLeaderboard = true;
        }
      } else {
        // Try creator_manager_programs
        const { data: program, error: programError } = await supabase
          .from('creator_manager_programs')
          .select('id, visibility')
          .eq('project_id', arenaData.project_id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (program && !programError) {
          const visibility = program.visibility;
          visibilityInfo = {
            visibility,
            isInvited: false,
            isApproved: false,
            utmLink: null,
          };

          // Check user participation (userProfileId already fetched above)
          if (userProfileId) {
            // Check if user is a creator in the program
            const { data: creator } = await supabase
              .from('creator_manager_creators')
              .select('id, status, creator_manager_links (id, utm_url)')
              .eq('program_id', program.id)
              .eq('creator_profile_id', userProfileId)
              .maybeSingle();

            if (creator) {
              visibilityInfo.isInvited = true;
              visibilityInfo.isApproved = creator.status === 'approved';
              
              // Get UTM link if available
              if (creator.creator_manager_links && Array.isArray(creator.creator_manager_links) && creator.creator_manager_links.length > 0) {
                const link = creator.creator_manager_links[0];
                visibilityInfo.utmLink = link.utm_url || null;
              }
            }
          }

          // Check visibility rules
          if (visibility === 'private') {
            canViewLeaderboard = visibilityInfo.isInvited && visibilityInfo.isApproved;
          } else if (visibility === 'public' || visibility === 'hybrid') {
            canViewLeaderboard = true;
          }
        }
      }
    } else {
      // For non-CRM, check normal ARC access
      const accessCheck = await requireArcAccess(supabase, arenaData.project_id, 2);
      if (!accessCheck.ok) {
        return res.status(403).json({ ok: false, error: accessCheck.error });
      }
    }

    // If private CRM and user not approved, return placeholder response
    if (isCRM && !canViewLeaderboard && visibilityInfo?.visibility === 'private') {
      return res.status(200).json({
        ok: true,
        entries: [],
        total: 0,
        page: pageNum,
        pageSize,
        totalPages: 0,
        visibility: visibilityInfo.visibility,
        isInvited: visibilityInfo.isInvited,
        isApproved: visibilityInfo.isApproved,
        utmLink: visibilityInfo.utmLink,
        message: 'This is a private Creator Program. Only invited participants can view the leaderboard.',
      });
    }

    // Calculate auto-tracked points from project_tweets
    const autoTrackedPoints = await calculateAutoTrackedPoints(supabase, arenaData.project_id);

    // Get joined creators (for multiplier and ring info)
    const { data: creators, error: creatorsError } = await supabase
      .from('arena_creators')
      .select('profile_id, twitter_username, ring, created_at, profiles:profile_id (username, profile_image_url)')
      .eq('arena_id', arenaData.id);

    if (creatorsError) {
      console.error('[ARC Leaderboard] Error fetching creators:', creatorsError);
    }

    // Get follow verification status for joined creators
    const joinedUsernames = new Set<string>();
    const joinedMap = new Map<string, {
      profile_id: string | null;
      ring: string | null;
      joined_at: string | null;
      follow_verified: boolean;
    }>();

    if (creators) {
      // Get all profile IDs for follow verification check
      const profileIds = creators
        .map(c => c.profile_id)
        .filter((id): id is string => !!id);

      // Check follow verification status from arc_project_follows
      const followVerifiedSet = new Set<string>();
      if (profileIds.length > 0) {
        const { data: followVerifications } = await supabase
          .from('arc_project_follows')
          .select('profile_id, twitter_username')
          .eq('project_id', arenaData.project_id)
          .in('profile_id', profileIds);

        if (followVerifications) {
          for (const verification of followVerifications) {
            if (verification.profile_id) {
              followVerifiedSet.add(verification.profile_id);
            }
            const normalizedUsername = normalizeTwitterUsername(verification.twitter_username);
            if (normalizedUsername) {
              followVerifiedSet.add(normalizedUsername);
            }
          }
        }
      }

      for (const creator of creators) {
        const normalizedUsername = normalizeTwitterUsername(creator.twitter_username);
        if (normalizedUsername) {
          joinedUsernames.add(normalizedUsername);
          // Check actual follow verification status
          const isFollowVerified = creator.profile_id 
            ? followVerifiedSet.has(creator.profile_id) || followVerifiedSet.has(normalizedUsername)
            : followVerifiedSet.has(normalizedUsername);
          
          joinedMap.set(normalizedUsername, {
            profile_id: creator.profile_id || null,
            ring: creator.ring as string | null,
            joined_at: creator.created_at || null,
            follow_verified: isFollowVerified,
          });
        }
      }
    }

    // Build leaderboard entries from auto-tracked points
    const entries: LeaderboardEntry[] = [];
    const profileMap = new Map<string, string | null>();

    // Extract profile images from joined creators (already fetched via join query)
    if (creators && creators.length > 0) {
      for (const creator of creators) {
        const normalizedUsername = normalizeTwitterUsername(creator.twitter_username);
        if (normalizedUsername) {
          // Extract profile_image_url from the joined profiles relation
          // Supabase returns relations as an object or array depending on cardinality
          const profile = (creator as any).profiles;
          if (profile) {
            // Handle both single object and array cases
            const profileData = Array.isArray(profile) ? (profile.length > 0 ? profile[0] : null) : profile;
            if (profileData?.profile_image_url) {
              profileMap.set(normalizedUsername, profileData.profile_image_url);
              // Also map by profile_id if available
              if (creator.profile_id) {
                profileMap.set(creator.profile_id, profileData.profile_image_url);
              }
            }
          }
        }
      }
    }

    // Get profile images for ALL creators in the leaderboard (by username)
    // This includes both joined and auto-tracked creators
    const allUsernames = Array.from(autoTrackedPoints.keys());
    const usernamesNeedingImages = allUsernames.filter(username => !profileMap.has(username));
    
    if (usernamesNeedingImages.length > 0) {
      // Fetch profiles - use .in() for exact match, Supabase should handle case-insensitive if needed
      // If that doesn't work, we'll fetch all and filter client-side
      const { data: profiles } = await supabase
        .from('profiles')
        .select('username, profile_image_url')
        .in('username', usernamesNeedingImages);

      // If no results with .in(), try fetching all and filtering client-side
      if (!profiles || profiles.length === 0) {
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('username, profile_image_url')
          .limit(10000); // Reasonable limit

        if (allProfiles) {
          for (const profile of allProfiles) {
            const normalized = normalizeTwitterUsername(profile.username);
            if (normalized && usernamesNeedingImages.includes(normalized) && !profileMap.has(normalized)) {
              profileMap.set(normalized, profile.profile_image_url || null);
            }
          }
        }
      } else {
        // Use results from .in() query
        for (const profile of profiles) {
          const normalized = normalizeTwitterUsername(profile.username);
          if (normalized && usernamesNeedingImages.includes(normalized) && !profileMap.has(normalized)) {
            profileMap.set(normalized, profile.profile_image_url || null);
          }
        }
      }
    }

    // Build entries with multipliers
    for (const [username, data] of autoTrackedPoints.entries()) {
      const joined = joinedMap.get(username);
      const isJoined = !!joined;
      const followVerified = joined?.follow_verified || false;
      
      // Multiplier: 1.5x if joined AND follow verified, else 1.0x
      const multiplier = (isJoined && followVerified) ? 1.5 : 1.0;
      const score = data.basePoints * multiplier;

      // Get avatar URL - try by username first, then by profile_id if joined
      let avatarUrl: string | null = null;
      avatarUrl = profileMap.get(username) || null;
      if (!avatarUrl && joined?.profile_id) {
        avatarUrl = profileMap.get(joined.profile_id) || null;
      }

      entries.push({
        rank: 0, // Will be set after sorting
        twitter_username: `@${username}`,
        avatar_url: avatarUrl,
        base_points: data.basePoints,
        multiplier,
        score,
        is_joined: isJoined,
        follow_verified: followVerified,
        ring: joined?.ring as 'core' | 'momentum' | 'discovery' | null,
        joined_at: joined?.joined_at || null,
      });
    }

    // Sort by score DESC
    entries.sort((a, b) => b.score - a.score);

    // Set ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    // Pagination
    const total = entries.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (pageNum - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedEntries = entries.slice(startIndex, endIndex);

    return res.status(200).json({
      ok: true,
      entries: paginatedEntries,
      total,
      page: pageNum,
      pageSize,
      totalPages,
      visibility: visibilityInfo?.visibility,
      isInvited: visibilityInfo?.isInvited,
      isApproved: visibilityInfo?.isApproved,
      utmLink: visibilityInfo?.utmLink,
    });
  } catch (error: any) {
    console.error('[ARC Arena Leaderboard API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

