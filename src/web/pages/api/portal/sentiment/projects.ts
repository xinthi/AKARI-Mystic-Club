/**
 * API Route: GET /api/portal/sentiment/projects
 * 
 * Returns projects with mindshare and smart followers data.
 * Supports window parameter: ?window=24h|48h|7d|30d
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient, getProjectsWithLatestMetrics, type ProjectWithMetrics } from '@/lib/portal/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { calculateProjectMindshare } from '@/server/mindshare/calculate';
import { getSmartFollowers, getSmartFollowersDeltas } from '@/server/smart-followers/calculate';

type ProjectsResponse =
  | {
      ok: true;
      projects: ProjectWithMetrics[];
      window: '24h' | '48h' | '7d' | '30d';
    }
  | {
      ok: false;
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProjectsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = createPortalClient();
    const supabaseAdmin = getSupabaseAdmin();
    const { window = '7d' } = req.query;

    const windowParam = (typeof window === 'string' && ['24h', '48h', '7d', '30d'].includes(window))
      ? window as '24h' | '48h' | '7d' | '30d'
      : '7d';

    // Get projects with latest metrics
    const projects = await getProjectsWithLatestMetrics(supabase);

    // Calculate mindshare and smart followers for each project
    const projectsWithMindshare = await Promise.all(
      projects.map(async (project) => {
        // Get project's X user ID (for smart followers)
        const { data: projectProfile } = await supabaseAdmin
          .from('projects')
          .select('x_handle, twitter_username')
          .eq('id', project.id)
          .maybeSingle();

        const xHandle = projectProfile?.x_handle || projectProfile?.twitter_username;
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

        // Calculate mindshare for the requested window
        let mindshareBps: number | null = null;
        let deltaBps1d: number | null = null;
        let deltaBps7d: number | null = null;

        try {
          const mindshareResult = await calculateProjectMindshare(
            supabaseAdmin,
            project.id,
            windowParam
          );
          mindshareBps = mindshareResult.mindshare_bps;
          deltaBps1d = mindshareResult.delta_bps_1d;
          deltaBps7d = mindshareResult.delta_bps_7d;
        } catch (error) {
          console.error(`[Sentiment Projects API] Error calculating mindshare for ${project.id}:`, error);
          // Continue with null values
        }

        // Calculate Smart Followers (if x_user_id available)
        let smartFollowersCount: number | null = null;
        let smartFollowersPct: number | null = null;
        let smartFollowersDelta7d: number | null = null;
        let smartFollowersDelta30d: number | null = null;

        if (xUserId) {
          try {
            const smartFollowers = await getSmartFollowers(
              supabaseAdmin,
              'project',
              project.id, // entityId for project is project.id
              xUserId,
              new Date()
            );
            smartFollowersCount = smartFollowers.smart_followers_count;
            smartFollowersPct = smartFollowers.smart_followers_pct;

            // Get deltas
            const deltas = await getSmartFollowersDeltas(
              supabaseAdmin,
              'project',
              project.id,
              xUserId
            );
            smartFollowersDelta7d = deltas.delta_7d;
            smartFollowersDelta30d = deltas.delta_30d;
          } catch (error) {
            console.error(`[Sentiment Projects API] Error calculating Smart Followers for ${project.id}:`, error);
            // Continue with null values
          }
        }

        // Map window to appropriate field
        const mindshareFields: Partial<ProjectWithMetrics> = {};
        if (windowParam === '24h') {
          mindshareFields.mindshare_bps_24h = mindshareBps;
        } else if (windowParam === '7d') {
          mindshareFields.mindshare_bps_7d = mindshareBps;
        } else if (windowParam === '30d') {
          mindshareFields.mindshare_bps_30d = mindshareBps;
        }

        return {
          ...project,
          ...mindshareFields,
          delta_bps_1d: deltaBps1d,
          delta_bps_7d: deltaBps7d,
          smart_followers_count: smartFollowersCount,
          smart_followers_pct: smartFollowersPct,
          smart_followers_delta_7d: smartFollowersDelta7d,
          smart_followers_delta_30d: smartFollowersDelta30d,
        };
      })
    );

    return res.status(200).json({
      ok: true,
      projects: projectsWithMindshare,
      window: windowParam,
    });
  } catch (error: any) {
    console.error('[Sentiment Projects API] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch projects with mindshare',
    });
  }
}

