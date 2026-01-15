/**
 * API Route: GET /api/portal/creator-manager/programs/[programId]/my-badges
 * 
 * Get badges for the current creator in a program.
 * 
 * Permissions: Creator can only view their own badges
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

type GetMyBadgesResponse =
  | { ok: true; badges: Array<{ id: string; slug: string; name: string; description: string | null; awarded_at: string }> }
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
  res: NextApiResponse<GetMyBadgesResponse>
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
    return res.status(403).json({ ok: false, error: 'You must connect your X account to view badges' });
  }

  const programId = req.query.programId as string;
  if (!programId) {
    return res.status(400).json({ ok: false, error: 'programId is required' });
  }

  try {
    // Verify creator is in this program
    const { data: creator, error: creatorError } = await supabase
      .from('creator_manager_creators')
      .select('id')
      .eq('program_id', programId)
      .eq('creator_profile_id', currentUser.profileId)
      .single();

    if (creatorError || !creator) {
      return res.status(404).json({ ok: false, error: 'You are not a member of this program' });
    }

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
      .eq('creator_profile_id', currentUser.profileId)
      .order('awarded_at', { ascending: false });

    if (badgesError) {
      console.error('[Get My Badges] Error:', badgesError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch badges' });
    }

    const formattedBadges = (badges || []).map((b: any) => {
      const badge = Array.isArray(b.creator_manager_badges) ? b.creator_manager_badges[0] : b.creator_manager_badges;
      return {
        id: badge.id,
        slug: badge.slug,
        name: badge.name,
        description: badge.description,
        awarded_at: b.awarded_at,
      };
    });

    return res.status(200).json({ ok: true, badges: formattedBadges });
  } catch (error: any) {
    console.error('[Get My Badges] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

