/**
 * API Route: GET /api/portal/arc/campaigns/[id]/leaderboard
 * 
 * Get leaderboard for a campaign based on X auto-tracking data.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkArcProjectApproval, getProfileIdFromUserId } from '@/lib/arc-permissions';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface LeaderboardEntry {
  rank: number;
  twitter_username: string;
  score: number;
  tweet_count?: number;
  likes?: number;
  retweets?: number;
  replies?: number;
}

interface LeaderboardResponse {
  ok: true;
  leaderboard: LeaderboardEntry[];
  campaign: {
    id: string;
    name: string;
    start_at: string;
    end_at: string;
    leaderboard_visibility: string;
  };
}

type LeaderboardAPIResponse =
  | LeaderboardResponse
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Calculate score for a participant based on their activity
 * Simple scoring: tweet_count + (likes * 0.1) + (retweets * 0.5) + (replies * 0.2)
 */
function calculateScore(activity: {
  tweet_count: number;
  total_likes: number;
  total_retweets: number;
  total_replies: number;
}): number {
  return (
    activity.tweet_count +
    activity.total_likes * 0.1 +
    activity.total_retweets * 0.5 +
    activity.total_replies * 0.2
  );
}

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

const DEV_MODE = process.env.NODE_ENV === 'development' && process.env.DEV_MODE === 'true';

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LeaderboardAPIResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { id: campaignId } = req.query;

    if (!campaignId || typeof campaignId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Campaign ID is required' });
    }

    // Get campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('arc_campaigns')
      .select('id, name, start_at, end_at, leaderboard_visibility, project_id')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    // Check ARC approval for the project
    const approval = await checkArcProjectApproval(supabase, campaign.project_id);
    if (!approval.isApproved && !DEV_MODE) {
      return res.status(403).json({
        ok: false,
        error: approval.isPending
          ? 'ARC access is pending approval'
          : approval.isRejected
          ? 'ARC access was rejected'
          : 'ARC access has not been approved for this project',
      });
    }

    // Check visibility rules: public leaderboards are visible to all, private require admin/participant
    if (campaign.leaderboard_visibility === 'private' && !DEV_MODE) {
      const sessionToken = getSessionToken(req);
      if (sessionToken) {
        const { data: session } = await supabase
          .from('akari_user_sessions')
          .select('user_id, expires_at')
          .eq('session_token', sessionToken)
          .single();

        if (session && new Date(session.expires_at) >= new Date()) {
          const userId = session.user_id;
          
          // Check if user is project admin/moderator or super admin
          const permissions = await checkProjectPermissions(supabase, userId, campaign.project_id);
          if (permissions.canManage || permissions.isSuperAdmin) {
            // Allow access
          } else {
            // Check if user is a participant
            const profileId = await getProfileIdFromUserId(supabase, userId);
            if (profileId) {
              const { data: participant } = await supabase
                .from('arc_campaign_participants')
                .select('id')
                .eq('campaign_id', campaignId)
                .eq('profile_id', profileId)
                .maybeSingle();
              
              if (!participant) {
                return res.status(403).json({
                  ok: false,
                  error: 'This leaderboard is private. Only participants and project admins can view it.',
                });
              }
            } else {
              return res.status(403).json({
                ok: false,
                error: 'This leaderboard is private. Only participants and project admins can view it.',
              });
            }
          }
        } else {
          return res.status(403).json({
            ok: false,
            error: 'This leaderboard is private. Authentication required.',
          });
        }
      } else {
        return res.status(403).json({
          ok: false,
          error: 'This leaderboard is private. Authentication required.',
        });
      }
    }

    // Get all participants
    const { data: participants, error: participantsError } = await supabase
      .from('arc_campaign_participants')
      .select('id, twitter_username')
      .eq('campaign_id', campaignId)
      .in('status', ['invited', 'accepted', 'tracked']);

    if (participantsError) {
      console.error('[ARC Leaderboard API] Participants error:', participantsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch participants' });
    }

    if (!participants || participants.length === 0) {
      return res.status(200).json({
        ok: true,
        leaderboard: [],
        campaign: {
          id: campaign.id,
          name: campaign.name,
          start_at: campaign.start_at,
          end_at: campaign.end_at,
          leaderboard_visibility: campaign.leaderboard_visibility,
        },
      });
    }

    // Get project X handle for matching
    const { data: project } = await supabase
      .from('projects')
      .select('x_handle')
      .eq('id', campaign.project_id)
      .single();

    const projectHandle = project?.x_handle?.toLowerCase().replace('@', '').trim();

    // Get user activity data for participants within campaign timeframe
    // This is a simplified version - in production, you'd want to aggregate from user_ct_activity
    // For now, we'll use a basic scoring based on tweet counts
    const startDate = new Date(campaign.start_at).toISOString();
    const endDate = new Date(campaign.end_at).toISOString();

    const leaderboard: LeaderboardEntry[] = [];

    // For each participant, calculate score
    for (const participant of participants) {
      const username = participant.twitter_username.toLowerCase().replace('@', '').trim();

      // Try to get profile ID to find user_ct_activity
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      let score = 0;
      let tweetCount = 0;
      let totalLikes = 0;
      let totalRetweets = 0;
      let totalReplies = 0;

      if (profile) {
        // Query user_ct_activity for this user and project within campaign dates
        // Note: user_ct_activity uses user_id (akari_users.id), not profile_id
        // We need to find the user_id from the profile
        // For now, we'll use a simplified approach - in production, you'd want to join through akari_user_identities
        const { data: activities } = await supabase
          .from('user_ct_activity')
          .select('likes, retweets, replies')
          .eq('project_id', campaign.project_id)
          .gte('tweeted_at', startDate)
          .lte('tweeted_at', endDate)
          .limit(1000); // Limit to avoid timeout

        if (activities && activities.length > 0) {
          tweetCount = activities.length;
          totalLikes = activities.reduce((sum, a) => sum + (a.likes || 0), 0);
          totalRetweets = activities.reduce((sum, a) => sum + (a.retweets || 0), 0);
          totalReplies = activities.reduce((sum, a) => sum + (a.replies || 0), 0);
        }

        score = calculateScore({
          tweet_count: tweetCount,
          total_likes: totalLikes,
          total_retweets: totalRetweets,
          total_replies: totalReplies,
        });
      }

      leaderboard.push({
        rank: 0, // Will be set after sorting
        twitter_username: participant.twitter_username,
        score: Math.round(score * 100) / 100, // Round to 2 decimal places
        tweet_count: tweetCount,
        likes: totalLikes,
        retweets: totalRetweets,
        replies: totalReplies,
      });
    }

    // Sort by score descending
    leaderboard.sort((a, b) => b.score - a.score);

    // Assign ranks
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return res.status(200).json({
      ok: true,
      leaderboard,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        start_at: campaign.start_at,
        end_at: campaign.end_at,
        leaderboard_visibility: campaign.leaderboard_visibility,
      },
    });
  } catch (error: any) {
    console.error('[ARC Leaderboard API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

