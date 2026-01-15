/**
 * API Route: GET /api/portal/creator-manager/my-programs
 * 
 * Returns Creator Manager programs for the current creator:
 * - Programs where they are a member (any status)
 * - Public/hybrid programs they can apply to
 * 
 * Auth: Must be logged in and have 'creator' in profiles.real_roles
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { calculateLevel } from '@/lib/creator-gamification';

// =============================================================================
// TYPES
// =============================================================================

interface CreatorProgram {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  visibility: 'private' | 'public' | 'hybrid';
  status: 'active' | 'paused' | 'ended';
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  project?: {
    id: string;
    name: string;
    slug: string;
    avatar_url: string | null;
    twitter_username: string | null;
  };
  creatorStatus?: 'pending' | 'approved' | 'rejected' | 'removed' | null;
  arcPoints?: number;
  xp?: number;
  creatorLevel?: number; // Computed from XP
  creatorRank?: number; // Rank in this program (1-based)
  class?: string | null;
  dealLabel?: string | null;
}

type MyProgramsResponse =
  | { ok: true; programs: CreatorProgram[]; requiresX?: boolean }
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

async function getCurrentUserProfile(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessionToken: string
): Promise<{ profileId: string; userId: string } | null> {
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

  // Get user's Twitter username to find profile
  const { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', session.user_id)
    .eq('provider', 'x')
    .single();

  if (!xIdentity?.username) {
    return null;
  }

  const cleanUsername = xIdentity.username.toLowerCase().replace('@', '').trim();
  let { data: profile } = await supabase
    .from('profiles')
    .select('id, real_roles')
    .eq('username', cleanUsername)
    .maybeSingle();

  if (!profile) {
    const { data: newProfile, error: createError } = await supabase
      .from('profiles')
      .insert({
        username: cleanUsername,
        name: cleanUsername,
        real_roles: ['user'],
        updated_at: new Date().toISOString(),
      })
      .select('id, real_roles')
      .single();

    if (createError || !newProfile) {
      return null;
    }
    profile = newProfile;
  }

  if (!profile.real_roles?.includes('creator')) {
    const nextRoles = [...(profile.real_roles || []), 'creator'];
    await supabase
      .from('profiles')
      .update({ real_roles: nextRoles })
      .eq('id', profile.id);
  }

  return {
    profileId: profile.id,
    userId: session.user_id,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MyProgramsResponse>
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

  const currentUser = await getCurrentUserProfile(supabase, sessionToken);
  if (!currentUser) {
    return res.status(200).json({
      ok: true,
      programs: [],
      requiresX: true,
    });
  }

  try {
    // Get programs where creator is a member
    const { data: creatorMemberships, error: membershipsError } = await supabase
      .from('creator_manager_creators')
      .select(`
        id,
        status,
        arc_points,
        xp,
        class,
        deal_id,
        creator_manager_programs!inner (
          id,
          project_id,
          title,
          description,
          visibility,
          status,
          start_at,
          end_at,
          created_at
        ),
        creator_manager_deals (
          internal_label
        )
      `)
      .eq('creator_profile_id', currentUser.profileId);

    if (membershipsError) {
      console.error('[My Creator Programs] Error fetching memberships:', membershipsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch programs' });
    }

    // Get programs where creator is NOT a member (public/hybrid/private)
    const programIds = (creatorMemberships || []).map((m: any) => {
      const program = Array.isArray(m.creator_manager_programs)
        ? m.creator_manager_programs[0]
        : m.creator_manager_programs;
      return program?.id;
    }).filter((id): id is string => id !== undefined);
    const { data: publicPrograms, error: publicError } = await supabase
      .from('creator_manager_programs')
      .select('*')
      .eq('status', 'active');

    if (publicError) {
      console.error('[My Creator Programs] Error fetching public programs:', publicError);
    }

    // Build response
    const programs: CreatorProgram[] = [];

    // Add programs where creator is a member
    if (creatorMemberships) {
      for (const membership of creatorMemberships) {
        // Handle potential array from join (should be single object due to !inner)
        const program = Array.isArray(membership.creator_manager_programs)
          ? membership.creator_manager_programs[0]
          : membership.creator_manager_programs;
        const deal = Array.isArray(membership.creator_manager_deals)
          ? membership.creator_manager_deals[0]
          : membership.creator_manager_deals;

        if (!program) continue;

        // Get project info
        const { data: project } = await supabase
          .from('projects')
          .select('id, name, slug, avatar_url, twitter_username')
          .eq('id', program.project_id)
          .single();

        // Calculate creator rank in this program
        // Get all approved creators for this program, sorted by ranking criteria
        const { data: allCreators } = await supabase
          .from('creator_manager_creators')
          .select('creator_profile_id, arc_points, xp, joined_at')
          .eq('program_id', program.id)
          .eq('status', 'approved')
          .order('arc_points', { ascending: false });

        let creatorRank: number | undefined;
        if (allCreators && allCreators.length > 0) {
          // Sort by ranking criteria: arc_points desc, xp desc, joined_at asc
          const sorted = [...allCreators].sort((a, b) => {
            if (a.arc_points !== b.arc_points) {
              return b.arc_points - a.arc_points;
            }
            if (a.xp !== b.xp) {
              return b.xp - a.xp;
            }
            return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
          });

          // Find current creator's rank (1-based)
          const rankIndex = sorted.findIndex(c => c.creator_profile_id === currentUser.profileId);
          if (rankIndex !== -1) {
            creatorRank = rankIndex + 1;
          }
        }

        programs.push({
          id: program.id,
          project_id: program.project_id,
          title: program.title,
          description: program.description,
          visibility: program.visibility,
          status: program.status,
          start_at: program.start_at,
          end_at: program.end_at,
          created_at: program.created_at,
          project: project ? {
            id: project.id,
            name: project.name,
            slug: project.slug,
            avatar_url: project.avatar_url,
            twitter_username: project.twitter_username,
          } : undefined,
          creatorStatus: membership.status,
          arcPoints: membership.arc_points,
          xp: membership.xp || 0,
          creatorLevel: calculateLevel(membership.xp || 0), // Compute level from XP
          creatorRank, // Rank in this program
          class: membership.class,
          dealLabel: deal?.internal_label || null,
        });
      }
    }

    // Add programs where creator is not a member
    if (publicPrograms) {
      for (const program of publicPrograms) {
        // Skip if already in list
        if (programIds.includes(program.id)) {
          continue;
        }

        // Get project info
        const { data: project } = await supabase
          .from('projects')
          .select('id, name, slug, avatar_url, twitter_username')
          .eq('id', program.project_id)
          .single();

        programs.push({
          id: program.id,
          project_id: program.project_id,
          title: program.title,
          description: program.description,
          visibility: program.visibility,
          status: program.status,
          start_at: program.start_at,
          end_at: program.end_at,
          created_at: program.created_at,
          project: project ? {
            id: project.id,
            name: project.name,
            slug: project.slug,
            avatar_url: project.avatar_url,
            twitter_username: project.twitter_username,
          } : undefined,
          creatorStatus: null, // Not a member yet
        });
      }
    }

    return res.status(200).json({ ok: true, programs });
  } catch (error: any) {
    console.error('[My Creator Programs] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

