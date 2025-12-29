/**
 * API Route: GET /api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId]
 * 
 * Get detailed information about a specific creator in a program.
 * 
 * Returns:
 * - Creator profile info
 * - Status, deal, class, arc_points, xp, level, rank
 * - Mission progress list
 * - Badges
 * 
 * Permissions: Only project admins/moderators can view
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkProjectPermissions } from '@/lib/project-permissions';
import { calculateLevel } from '@/lib/creator-gamification';

// =============================================================================
// TYPES
// =============================================================================

interface MissionProgress {
  mission_id: string;
  mission_title: string;
  status: 'in_progress' | 'submitted' | 'approved' | 'rejected';
  post_url: string | null;
  post_tweet_id: string | null;
  notes: string | null;
  last_update_at: string;
}

interface Badge {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  awarded_at: string;
}

interface CreatorDetail {
  creator: {
    id: string;
    creator_profile_id: string;
    status: 'pending' | 'approved' | 'rejected' | 'removed';
    arc_points: number;
    xp: number;
    level: number;
    rank: number;
    class: string | null;
    deal_id: string | null;
    deal_label: string | null;
    joined_at: string;
  };
  profile: {
    id: string;
    username: string;
    name: string | null;
    profile_image_url: string | null;
  };
  missionProgress: MissionProgress[];
  badges: Badge[];
}

type CreatorDetailResponse =
  | { ok: true; data: CreatorDetail }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
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

async function getCurrentUser(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string): Promise<{ userId: string } | null> {
  const { data: session, error: sessionError } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (sessionError || !session) {
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    return null;
  }

  return {
    userId: session.user_id,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreatorDetailResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();

  // Get current user
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  const currentUser = await getCurrentUser(supabase, sessionToken);
  if (!currentUser) {
    return res.status(401).json({ ok: false, error: 'Invalid session' });
  }

  const programId = req.query.programId as string;
  const creatorProfileId = req.query.creatorProfileId as string;

  if (!programId || !creatorProfileId) {
    return res.status(400).json({ ok: false, error: 'programId and creatorProfileId are required' });
  }

  try {
    // Get program to find project_id
    const { data: program, error: programError } = await supabase
      .from('creator_manager_programs')
      .select('project_id')
      .eq('id', programId)
      .single();

    if (programError || !program) {
      return res.status(404).json({ ok: false, error: 'Program not found' });
    }

    // Check permissions
    const permissions = await checkProjectPermissions(supabase, currentUser.userId, program.project_id);
    if (!permissions.canManage && !permissions.isSuperAdmin) {
      return res.status(403).json({
        ok: false,
        error: 'Only project admins and moderators can view creator details',
      });
    }

    // Get creator record
    const { data: creator, error: creatorError } = await supabase
      .from('creator_manager_creators')
      .select(`
        id,
        creator_profile_id,
        status,
        arc_points,
        xp,
        class,
        deal_id,
        joined_at,
        creator_manager_deals (
          internal_label
        )
      `)
      .eq('program_id', programId)
      .eq('creator_profile_id', creatorProfileId)
      .single();

    if (creatorError || !creator) {
      return res.status(404).json({ ok: false, error: 'Creator not found in this program' });
    }

    // Get profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, name, profile_image_url')
      .eq('id', creatorProfileId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ ok: false, error: 'Profile not found' });
    }

    // Get all creators to calculate rank
    const { data: allCreators } = await supabase
      .from('creator_manager_creators')
      .select('creator_profile_id, arc_points, xp, joined_at')
      .eq('program_id', programId)
      .eq('status', 'approved')
      .order('arc_points', { ascending: false });

    let rank = 0;
    if (allCreators && allCreators.length > 0) {
      const sorted = [...allCreators].sort((a, b) => {
        if (a.arc_points !== b.arc_points) return b.arc_points - a.arc_points;
        if (a.xp !== b.xp) return b.xp - a.xp;
        return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
      });
      const rankIndex = sorted.findIndex(c => c.creator_profile_id === creatorProfileId);
      if (rankIndex !== -1) {
        rank = rankIndex + 1;
      }
    }

    // Get mission progress
    const { data: progress, error: progressError } = await supabase
      .from('creator_manager_mission_progress')
      .select(`
        mission_id,
        status,
        post_url,
        post_tweet_id,
        notes,
        last_update_at,
        creator_manager_missions!inner (
          title
        )
      `)
      .eq('program_id', programId)
      .eq('creator_profile_id', creatorProfileId);

    const missionProgress: MissionProgress[] = (progress || []).map((p: any) => {
      const mission = Array.isArray(p.creator_manager_missions) ? p.creator_manager_missions[0] : p.creator_manager_missions;
      return {
        mission_id: p.mission_id,
        mission_title: mission?.title || 'Unknown Mission',
        status: p.status,
        post_url: p.post_url,
        post_tweet_id: p.post_tweet_id,
        notes: p.notes,
        last_update_at: p.last_update_at,
      };
    });

    // Get badges
    const { data: badges, error: badgesError } = await supabase
      .from('creator_manager_creator_badges')
      .select(`
        id,
        awarded_at,
        creator_manager_badges (
          id,
          slug,
          name,
          description
        )
      `)
      .eq('program_id', programId)
      .eq('creator_profile_id', creatorProfileId)
      .order('awarded_at', { ascending: false });

    const formattedBadges: Badge[] = (badges || []).map((b: any) => {
      const badge = Array.isArray(b.creator_manager_badges) ? b.creator_manager_badges[0] : b.creator_manager_badges;
      return {
        id: badge.id,
        slug: badge.slug,
        name: badge.name,
        description: badge.description,
        awarded_at: b.awarded_at,
      };
    });

    const deal = Array.isArray(creator.creator_manager_deals) 
      ? creator.creator_manager_deals[0] 
      : creator.creator_manager_deals;

    return res.status(200).json({
      ok: true,
      data: {
        creator: {
          id: creator.id,
          creator_profile_id: creator.creator_profile_id,
          status: creator.status,
          arc_points: creator.arc_points,
          xp: creator.xp || 0,
          level: calculateLevel(creator.xp || 0),
          rank,
          class: creator.class,
          deal_id: creator.deal_id,
          deal_label: deal?.internal_label || null,
          joined_at: creator.joined_at,
        },
        profile: {
          id: profile.id,
          username: profile.username,
          name: profile.name,
          profile_image_url: profile.profile_image_url,
        },
        missionProgress,
        badges: formattedBadges,
      },
    });
  } catch (error: any) {
    console.error('[Creator Detail] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

