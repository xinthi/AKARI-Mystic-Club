/**
 * API Route: GET /api/portal/arc/quests/[id]/leaderboard
 * 
 * Returns mini leaderboard for a specific quest
 * Calculates points from arc_contributions during quest period
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { fetchProfileImagesForHandles } from '@/lib/portal/supabase';

interface LeaderboardEntry {
  rank: number;
  twitter_username: string;
  avatar_url: string | null;
  points: number;
  contributions: number;
  ring: 'core' | 'momentum' | 'discovery' | null;
}

type LeaderboardResponse =
  | { ok: true; entries: LeaderboardEntry[]; quest: { id: string; name: string; status: string } }
  | { ok: false; error: string };

function normalizeTwitterUsername(username: string | null | undefined): string {
  if (!username) return '';
  return username.toLowerCase().replace(/^@/, '').trim();
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
    const { id: questId } = req.query;

    if (!questId || typeof questId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Quest ID is required' });
    }

    // Fetch quest
    const { data: quest, error: questError } = await supabase
      .from('arc_quests')
      .select('id, project_id, name, status, starts_at, ends_at, arena_id')
      .eq('id', questId)
      .single();

    if (questError || !quest) {
      return res.status(404).json({ ok: false, error: 'Quest not found' });
    }

    // Check ARC access (Option 3 = Gamified)
    const accessCheck = await requireArcAccess(supabase, quest.project_id, 3);
    if (!accessCheck.ok) {
      return res.status(403).json({ ok: false, error: accessCheck.error });
    }

    // Calculate points from contributions during quest period
    // Use arc_contributions if available, otherwise fall back to project_tweets
    const questStart = new Date(quest.starts_at);
    const questEnd = new Date(quest.ends_at);

    // Try to get contributions from arc_contributions first
    const { data: contributions, error: contribError } = await supabase
      .from('arc_contributions')
      .select('twitter_username, profile_id, created_at, engagement_json')
      .eq('project_id', quest.project_id)
      .gte('created_at', quest.starts_at)
      .lte('created_at', quest.ends_at);

    const pointsMap = new Map<string, { points: number; count: number }>();

    if (contributions && !contribError) {
      // Calculate points from contributions
      for (const contrib of contributions) {
        const normalizedUsername = normalizeTwitterUsername(contrib.twitter_username);
        if (!normalizedUsername) continue;

        const engagement = contrib.engagement_json as any;
        const likes = engagement?.likes || 0;
        const replies = engagement?.replies || 0;
        const retweets = engagement?.retweets || 0;
        
        // Points: likes + replies*2 + retweets*3
        const contributionPoints = likes + replies * 2 + retweets * 3;
        
        const current = pointsMap.get(normalizedUsername) || { points: 0, count: 0 };
        pointsMap.set(normalizedUsername, {
          points: current.points + contributionPoints,
          count: current.count + 1,
        });
      }
    } else {
      // Fallback to project_tweets
      const { data: tweets } = await supabase
        .from('project_tweets')
        .select('author_handle, likes, replies, retweets, created_at')
        .eq('project_id', quest.project_id)
        .eq('is_official', false)
        .gte('created_at', quest.starts_at)
        .lte('created_at', quest.ends_at);

      if (tweets) {
        for (const tweet of tweets) {
          const normalizedUsername = normalizeTwitterUsername(tweet.author_handle);
          if (!normalizedUsername) continue;

          const engagement = (tweet.likes || 0) + (tweet.replies || 0) * 2 + (tweet.retweets || 0) * 3;
          const current = pointsMap.get(normalizedUsername) || { points: 0, count: 0 };
          pointsMap.set(normalizedUsername, {
            points: current.points + engagement,
            count: current.count + 1,
          });
        }
      }
    }

    // Get ring information from arena_creators if quest has arena_id
    const ringMap = new Map<string, string | null>();
    if (quest.arena_id) {
      const { data: creators } = await supabase
        .from('arena_creators')
        .select('twitter_username, ring')
        .eq('arena_id', quest.arena_id);

      if (creators) {
        for (const creator of creators) {
          const normalized = normalizeTwitterUsername(creator.twitter_username);
          if (normalized) {
            ringMap.set(normalized, creator.ring);
          }
        }
      }
    }

    // Build leaderboard entries
    const entries: LeaderboardEntry[] = [];

    // Get profile images using the helper function
    const allUsernames = Array.from(pointsMap.keys());
    const avatarMap = new Map<string, string | null>();
    if (allUsernames.length > 0) {
      const { profilesMap, akariUsersMap } = await fetchProfileImagesForHandles(supabase, allUsernames);
      
      // Combine both maps (akariUsersMap takes precedence if both exist)
      for (const [username, imageUrl] of profilesMap.entries()) {
        avatarMap.set(username, imageUrl);
      }
      for (const [username, imageUrl] of akariUsersMap.entries()) {
        avatarMap.set(username, imageUrl);
      }
    }

    // Create entries
    for (const [username, data] of pointsMap.entries()) {
      entries.push({
        rank: 0, // Will be set after sorting
        twitter_username: `@${username}`,
        avatar_url: avatarMap.get(username) || null,
        points: data.points,
        contributions: data.count,
        ring: (ringMap.get(username) as 'core' | 'momentum' | 'discovery') || null,
      });
    }

    // Sort by points DESC and assign ranks
    entries.sort((a, b) => b.points - a.points);
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    // Return top 20 for mini leaderboard
    return res.status(200).json({
      ok: true,
      entries: entries.slice(0, 20),
      quest: {
        id: quest.id,
        name: quest.name,
        status: quest.status,
      },
    });
  } catch (error: any) {
    console.error('[Quest Leaderboard API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

