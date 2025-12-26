/**
 * API Route: GET /api/portal/arc/leaderboards
 * 
 * Global ARC leaderboard across all projects
 * Supports time period filtering
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

interface LeaderboardEntry {
  twitter_username: string;
  avatar_url: string | null;
  arc_points: number;
  mindshare?: number;
  followers?: number;
  smart_followers?: number;
  ring: 'core' | 'momentum' | 'discovery' | null;
  style: string | null;
  project_name?: string;
  project_slug?: string;
}

type LeaderboardResponse =
  | { ok: true; entries: LeaderboardEntry[] }
  | { ok: false; error: string };

function getDateFilter(period: string): { startDate: Date | null } {
  const now = new Date();
  let startDate: Date | null = null;

  switch (period) {
    case '7D':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30D':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      break;
    case '3M':
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case '6M':
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case '12M':
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 12);
      break;
    case 'ALL':
    default:
      startDate = null;
      break;
  }

  return { startDate };
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
      return; // requirePortalUser already sent 401 response
    }

    const supabase = getSupabaseAdmin();
    const { period = '7D' } = req.query;

    const { startDate } = getDateFilter(period as string);

    // Get all arena creators with their points
    let query = supabase
      .from('arena_creators')
      .select(`
        twitter_username,
        arc_points,
        ring,
        style,
        created_at,
        updated_at,
        arenas:arena_id (
          id,
          name,
          slug,
          project_id,
          projects:project_id (
            id,
            name,
            slug
          )
        ),
        profiles:profile_id (
          username,
          profile_image_url
        )
      `)
      .order('arc_points', { ascending: false });

    // Apply date filter if specified
    if (startDate) {
      query = query.gte('updated_at', startDate.toISOString());
    }

    const { data: creators, error } = await query;

    if (error) {
      console.error('[ARC Leaderboards API] Error fetching creators:', error);
      return res.status(500).json({ ok: false, error: 'Failed to fetch leaderboard' });
    }

    // Aggregate by twitter_username (sum points across all arenas)
    const entriesMap = new Map<string, LeaderboardEntry>();

    for (const creator of creators || []) {
      const username = creator.twitter_username?.toLowerCase().replace('@', '') || '';
      if (!username) continue;

      const arena = Array.isArray(creator.arenas) ? creator.arenas[0] : creator.arenas;
      const project = arena?.projects;
      const profile = Array.isArray(creator.profiles) ? creator.profiles[0] : creator.profiles;

      const points = Number(creator.arc_points) || 0;

      if (entriesMap.has(username)) {
        const existing = entriesMap.get(username)!;
        existing.arc_points += points;
        // Use the most recent ring/style or highest points project
        if (points > existing.arc_points - points) {
          existing.ring = creator.ring as 'core' | 'momentum' | 'discovery' | null;
          existing.style = creator.style || null;
          if (project) {
            existing.project_name = project.name;
            existing.project_slug = project.slug || undefined;
          }
        }
      } else {
        entriesMap.set(username, {
          twitter_username: `@${username}`,
          avatar_url: profile?.profile_image_url || null,
          arc_points: points,
          ring: creator.ring as 'core' | 'momentum' | 'discovery' | null,
          style: creator.style || null,
          project_name: project?.name || undefined,
          project_slug: project?.slug || undefined,
        });
      }
    }

    // Convert to array and sort by points
    const entries: LeaderboardEntry[] = Array.from(entriesMap.values())
      .sort((a, b) => b.arc_points - a.arc_points)
      .slice(0, 1000); // Top 1000

    return res.status(200).json({ ok: true, entries });
  } catch (error: any) {
    console.error('[ARC Leaderboards API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

