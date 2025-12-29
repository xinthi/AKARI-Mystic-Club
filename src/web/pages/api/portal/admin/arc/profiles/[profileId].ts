/**
 * API Route: PATCH /api/portal/admin/arc/profiles/[profileId]
 * 
 * Updates arc_active and arc_access_level for a project profile.
 * SuperAdmin only.
 * 
 * Only updates:
 * - arc_active (boolean)
 * - arc_access_level ('none' | 'creator_manager' | 'leaderboard' | 'gamified')
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface UpdateProfileBody {
  arc_active?: boolean;
  arc_access_level?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
}

interface UpdatedProfile {
  profile_id: string;
  name: string;
  twitter_username: string | null;
  logo_url: string | null;
  arc_active: boolean;
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
}

type UpdateProfileResponse =
  | {
      ok: true;
      profile: UpdatedProfile;
    }
  | {
      ok: false;
      error: string;
      details?: any;
    };

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

async function checkSuperAdmin(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<boolean> {
  try {
    // Check akari_user_roles table
    const { data: userRoles, error: rolesError } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin');

    if (rolesError) {
      console.error('[ArcProfileUpdateAPI] Error checking akari_user_roles:', rolesError);
    } else if (userRoles && userRoles.length > 0) {
      return true;
    }

    // Also check profiles.real_roles via Twitter username
    const { data: xIdentity, error: identityError } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .single();

    if (identityError) {
      console.error('[ArcProfileUpdateAPI] Error checking akari_user_identities:', identityError);
      return false;
    }

    if (xIdentity?.username) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('real_roles')
        .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
        .single();

      if (profileError) {
        console.error('[ArcProfileUpdateAPI] Error checking profiles:', profileError);
        return false;
      }

      if (profile?.real_roles?.includes('super_admin')) {
        return true;
      }
    }

    return false;
  } catch (err: any) {
    console.error('[ArcProfileUpdateAPI] Error in checkSuperAdmin:', err);
    return false;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdateProfileResponse>
) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Get session token
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Validate session and get user ID
    const { data: session, error: sessionError } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from('akari_user_sessions')
        .delete()
        .eq('session_token', sessionToken);
      return res.status(401).json({ ok: false, error: 'Session expired' });
    }

    const userId = session.user_id;

    // Check if user is super admin
    const isSuperAdmin = await checkSuperAdmin(supabase, userId);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
    }

    // Get profileId from URL
    const { profileId } = req.query;
    if (!profileId || typeof profileId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing profileId parameter' });
    }

    // Parse request body
    const body: UpdateProfileBody = req.body;
    if (!body || (body.arc_active === undefined && body.arc_access_level === undefined)) {
      return res.status(400).json({
        ok: false,
        error: 'Request body must include at least one of: arc_active, arc_access_level',
      });
    }

    // Validate arc_access_level enum if provided
    if (body.arc_access_level !== undefined) {
      const validLevels: Array<'none' | 'creator_manager' | 'leaderboard' | 'gamified'> = [
        'none',
        'creator_manager',
        'leaderboard',
        'gamified',
      ];
      if (!validLevels.includes(body.arc_access_level)) {
        return res.status(400).json({
          ok: false,
          error: 'arc_access_level must be one of: none, creator_manager, leaderboard, gamified',
        });
      }
    }

    // Validate arc_active is boolean if provided
    if (body.arc_active !== undefined && typeof body.arc_active !== 'boolean') {
      return res.status(400).json({
        ok: false,
        error: 'arc_active must be a boolean',
      });
    }

    // Check if profile exists
    const { data: existingProfile, error: fetchError } = await supabase
      .from('projects')
      .select('id, name, display_name, x_handle, twitter_username, avatar_url, arc_active, arc_access_level')
      .eq('id', profileId)
      .single();

    if (fetchError || !existingProfile) {
      return res.status(404).json({ ok: false, error: 'Profile not found' });
    }

    // Build update object (only include fields that were provided)
    const updateData: Record<string, any> = {};
    if (body.arc_active !== undefined) {
      updateData.arc_active = body.arc_active;
    }
    if (body.arc_access_level !== undefined) {
      updateData.arc_access_level = body.arc_access_level;
    }

    // Update profile (only the specified fields)
    const { data: updatedProfile, error: updateError } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', profileId)
      .select('id, name, display_name, x_handle, twitter_username, avatar_url, arc_active, arc_access_level')
      .single();

    if (updateError) {
      console.error('[ArcProfileUpdateAPI] Error updating profile:', updateError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to update profile',
        details: updateError.message,
      });
    }

    if (!updatedProfile) {
      return res.status(404).json({ ok: false, error: 'Profile not found after update' });
    }

    // Return updated profile in response format
    const response: UpdatedProfile = {
      profile_id: updatedProfile.id,
      name: updatedProfile.display_name || updatedProfile.name || 'Unnamed Project',
      twitter_username: updatedProfile.twitter_username || updatedProfile.x_handle || null,
      logo_url: (updatedProfile as any).avatar_url || null,
      arc_active: typeof updatedProfile.arc_active === 'boolean' ? updatedProfile.arc_active : false,
      arc_access_level:
        (updatedProfile.arc_access_level as 'none' | 'creator_manager' | 'leaderboard' | 'gamified') || 'none',
    };

    return res.status(200).json({
      ok: true,
      profile: response,
    });
  } catch (error: any) {
    console.error('[ArcProfileUpdateAPI] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
      details: error.stack || undefined,
    });
  }
}

