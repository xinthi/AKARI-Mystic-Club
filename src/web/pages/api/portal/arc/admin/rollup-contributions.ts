/**
 * API Route: POST /api/portal/arc/admin/rollup-contributions
 * 
 * Manual admin endpoint for daily base point computation from contributions.
 * This computes base_points for arena_creators based on arc_contributions.
 * 
 * Requires: super_admin only
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface RollupPayload {
  project_id?: string;
  arena_id?: string;
  date?: string; // YYYY-MM-DD format, defaults to today
}

type RollupResponse =
  | { ok: true; message: string; updated: number }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

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
  res: NextApiResponse<RollupResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Authentication - super_admin only
    let userId: string | null = null;
    if (!DEV_MODE) {
      const sessionToken = getSessionToken(req);
      if (!sessionToken) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      const { data: session, error: sessionError } = await supabase
        .from('akari_user_sessions')
        .select('user_id, expires_at')
        .eq('session_token', sessionToken)
        .single();

      if (sessionError || !session) {
        return res.status(401).json({ ok: false, error: 'Invalid session' });
      }

      if (new Date(session.expires_at) < new Date()) {
        await supabase
          .from('akari_user_sessions')
          .delete()
          .eq('session_token', sessionToken);
        return res.status(401).json({ ok: false, error: 'Session expired' });
      }

      userId = session.user_id;

      // Check if super admin
      const { data: role } = await supabase
        .from('akari_user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'super_admin')
        .maybeSingle();

      if (!role) {
        return res.status(403).json({ ok: false, error: 'Super admin access required' });
      }
    } else {
      // DEV MODE: Find a super admin user
      const { data: superAdmin } = await supabase
        .from('akari_user_roles')
        .select('user_id')
        .eq('role', 'super_admin')
        .limit(1)
        .maybeSingle();
      userId = superAdmin?.user_id || null;
    }

    // Parse body
    const body = req.body as RollupPayload;
    const targetDate = body.date ? new Date(body.date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Build query for contributions
    let contributionsQuery = supabase
      .from('arc_contributions')
      .select('project_id, arena_id, profile_id, twitter_username, post_type, engagement_json')
      .gte('created_at', targetDate.toISOString())
      .lt('created_at', nextDay.toISOString());

    if (body.project_id) {
      contributionsQuery = contributionsQuery.eq('project_id', body.project_id);
    }
    if (body.arena_id) {
      contributionsQuery = contributionsQuery.eq('arena_id', body.arena_id);
    }

    const { data: contributions, error: contributionsError } = await contributionsQuery;

    if (contributionsError) {
      console.error('[Rollup Contributions] Error fetching contributions:', contributionsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch contributions' });
    }

    if (!contributions || contributions.length === 0) {
      return res.status(200).json({
        ok: true,
        message: 'No contributions found for the specified date',
        updated: 0,
      });
    }

    // Group contributions by (project_id, arena_id, profile_id/twitter_username)
    const pointsMap = new Map<string, number>();

    for (const contrib of contributions) {
      const key = `${contrib.project_id}:${contrib.arena_id || 'null'}:${contrib.profile_id || contrib.twitter_username}`;
      
      // Simple scoring: 1 point per contribution (can be enhanced later)
      // In production, this would use engagement_json and sentiment_score
      const points = 1;
      
      pointsMap.set(key, (pointsMap.get(key) || 0) + points);
    }

    // Update arena_creators with computed points
    let updatedCount = 0;
    for (const [key, points] of pointsMap.entries()) {
      const [projectId, arenaIdStr, identifier] = key.split(':');
      const arenaId = arenaIdStr === 'null' ? null : arenaIdStr;

      // Find or create arena_creators entry
      let creatorQuery = supabase
        .from('arena_creators')
        .select('id, arc_points')
        .eq('arena_id', arenaId || '');

      if (identifier.includes('-')) {
        // UUID (profile_id)
        creatorQuery = creatorQuery.eq('profile_id', identifier);
      } else {
        // twitter_username
        creatorQuery = creatorQuery.eq('twitter_username', identifier);
      }

      const { data: creator, error: creatorError } = await creatorQuery.maybeSingle();

      if (creatorError && creatorError.code !== 'PGRST116') {
        console.error('[Rollup Contributions] Error finding creator:', creatorError);
        continue;
      }

      if (creator) {
        // Update existing creator
        const { error: updateError } = await supabase
          .from('arena_creators')
          .update({ arc_points: (creator.arc_points || 0) + points })
          .eq('id', creator.id);

        if (updateError) {
          console.error('[Rollup Contributions] Error updating creator:', updateError);
          continue;
        }
        updatedCount++;
      } else if (arenaId) {
        // Create new creator entry (if arena_id is provided)
        const { error: insertError } = await supabase
          .from('arena_creators')
          .insert({
            arena_id: arenaId,
            profile_id: identifier.includes('-') ? identifier : null,
            twitter_username: identifier.includes('-') ? null : identifier,
            arc_points: points,
            ring: 'discovery',
          });

        if (insertError) {
          console.error('[Rollup Contributions] Error creating creator:', insertError);
          continue;
        }
        updatedCount++;
      }
    }

    return res.status(200).json({
      ok: true,
      message: `Successfully rolled up ${contributions.length} contributions`,
      updated: updatedCount,
    });
  } catch (error: any) {
    console.error('[Rollup Contributions] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}


