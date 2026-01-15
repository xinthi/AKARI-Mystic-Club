/**
 * API Route: GET /api/portal/creator-manager/programs/[programId]/creators
 * 
 * Returns all creators for a Creator Manager program with their details.
 * 
 * Permissions: Project admins/moderators can see all creators, creators can see their own data
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkProjectPermissions } from '@/lib/project-permissions';
import { checkArcProjectApproval } from '@/lib/arc-permissions';
import { calculateLevel } from '@/lib/creator-gamification';

// =============================================================================
// TYPES
// =============================================================================

interface Creator {
  id: string;
  program_id: string;
  creator_profile_id: string;
  deal_id: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'removed';
  arc_points: number;
  xp: number;
  creatorLevel: number; // Computed from XP
  class: string | null;
  rank: number; // Rank based on arc_points desc, xp desc, joined_at asc (calculated after formatting)
  joined_at: string;
  updated_at: string;
  profile?: {
    id: string;
    username: string;
    name: string | null;
    profile_image_url: string | null;
  };
  deal?: {
    id: string;
    internal_label: string;
  } | null;
}

type CreatorsResponse =
  | { ok: true; creators: Creator[] }
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

async function getCurrentUser(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string): Promise<{ userId: string; profileId: string | null } | null> {
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

  let { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', session.user_id)
    .in('provider', ['x', 'twitter'])
    .maybeSingle();

  if (!xIdentity?.username) {
    const { data: fallbackIdentity } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', session.user_id)
      .not('username', 'is', null)
      .maybeSingle();
    xIdentity = fallbackIdentity || xIdentity;
  }

  let profileId: string | null = null;
  if (xIdentity?.username) {
    const cleanUsername = xIdentity.username.toLowerCase().replace('@', '').trim();
    let { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (!profile) {
      const { data: profileFallback } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', cleanUsername)
        .maybeSingle();
      profile = profileFallback || profile;
    }

    profileId = profile?.id || null;
  }

  return {
    userId: session.user_id,
    profileId,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreatorsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();

  const programId = req.query.programId as string;
  if (!programId) {
    return res.status(400).json({ ok: false, error: 'programId is required' });
  }

  // Get current user (optional - for permission checks)
  const sessionToken = getSessionToken(req);
  let currentUser: { userId: string; profileId: string | null } | null = null;
  if (sessionToken) {
    currentUser = await getCurrentUser(supabase, sessionToken);
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

    // Check ARC approval for the project
    const approval = await checkArcProjectApproval(supabase, program.project_id);
    if (!approval.isApproved) {
      return res.status(403).json({
        ok: false,
        error: approval.isPending
          ? 'ARC access is pending approval'
          : approval.isRejected
          ? 'ARC access was rejected'
          : 'ARC access has not been approved for this project',
      });
    }

    // Check if user has permission to view all creators
    let canViewAll = false;
    if (currentUser) {
      const permissions = await checkProjectPermissions(supabase, currentUser.userId, program.project_id);
      canViewAll = permissions.canManage || permissions.isSuperAdmin;
    }

    // Get creators
    let creatorsQuery = supabase
      .from('creator_manager_creators')
      .select(`
        id,
        program_id,
        creator_profile_id,
        deal_id,
        status,
        arc_points,
        xp,
        class,
        joined_at,
        updated_at,
        profiles:creator_profile_id (
          id,
          username,
          name,
          profile_image_url
        ),
        creator_manager_deals (
          id,
          internal_label
        )
      `)
      .eq('program_id', programId);

    // If not admin/moderator, only show approved creators (for public leaderboard)
    if (!canViewAll) {
      creatorsQuery = creatorsQuery.eq('status', 'approved');
    }

    const { data: creators, error: creatorsError } = await creatorsQuery.order('arc_points', { ascending: false });

    if (creatorsError) {
      console.error('[Creator Manager Creators] Error fetching creators:', creatorsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch creators' });
    }

    // Format response with computed level (rank will be added after sorting)
    const formattedCreators = (creators || []).map((c: any) => ({
      id: c.id,
      program_id: c.program_id,
      creator_profile_id: c.creator_profile_id,
      deal_id: c.deal_id,
      status: c.status,
      arc_points: c.arc_points,
      xp: c.xp || 0,
      creatorLevel: calculateLevel(c.xp || 0), // Compute level from XP
      class: c.class,
      joined_at: c.joined_at,
      updated_at: c.updated_at,
      profile: c.profiles ? {
        id: c.profiles.id,
        username: c.profiles.username,
        name: c.profiles.name,
        profile_image_url: c.profiles.profile_image_url,
      } : undefined,
      deal: c.creator_manager_deals ? {
        id: c.creator_manager_deals.id,
        internal_label: c.creator_manager_deals.internal_label,
      } : null,
    }));

    // Calculate ranks: sort by arc_points desc, then xp desc, then joined_at asc
    const sortedForRanking = [...formattedCreators].sort((a, b) => {
      // Primary: arc_points descending
      if (a.arc_points !== b.arc_points) {
        return b.arc_points - a.arc_points;
      }
      // Tie-breaker 1: xp descending
      if (a.xp !== b.xp) {
        return b.xp - a.xp;
      }
      // Tie-breaker 2: joined_at ascending (earlier join = better rank)
      return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
    });

    // Assign ranks (1-based) and type as Creator[]
    const creatorsWithRank: Creator[] = sortedForRanking.map((creator, index) => ({
      ...creator,
      rank: index + 1,
    }));

    // Return sorted by rank
    return res.status(200).json({ ok: true, creators: creatorsWithRank });
  } catch (error: any) {
    console.error('[Creator Manager Creators] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

