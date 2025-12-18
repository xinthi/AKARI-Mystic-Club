/**
 * API Route: GET /api/portal/admin/arc/profiles
 * 
 * Returns list of project/company profiles eligible for ARC management.
 * SuperAdmin only.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface ArcProfile {
  profile_id: string;
  name: string;
  twitter_username: string | null;
  logo_url: string | null;
  arc_active: boolean;
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
}

type ArcProfilesResponse =
  | {
      ok: true;
      profiles: ArcProfile[];
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
      console.error('[ArcProfilesAdminAPI] Error checking akari_user_roles:', rolesError);
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
      console.error('[ArcProfilesAdminAPI] Error checking akari_user_identities:', identityError);
      return false;
    }

    if (xIdentity?.username) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('real_roles')
        .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
        .single();

      if (profileError) {
        console.error('[ArcProfilesAdminAPI] Error checking profiles:', profileError);
        return false;
      }

      if (profile?.real_roles?.includes('super_admin')) {
        return true;
      }
    }

    return false;
  } catch (err: any) {
    console.error('[ArcProfilesAdminAPI] Error in checkSuperAdmin:', err);
    return false;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ArcProfilesResponse>
) {
  if (req.method !== 'GET') {
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

    // Fetch profiles eligible for ARC management
    // Filter: profile_type = 'project' (excludes 'personal' and NULL/individual)
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, name, display_name, x_handle, twitter_username, avatar_url, arc_active, arc_access_level, profile_type')
      .eq('profile_type', 'project')
      .order('name', { ascending: true });

    if (projectsError) {
      console.error('[ArcProfilesAdminAPI] Error fetching projects:', projectsError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch profiles',
        details: projectsError.message,
      });
    }

    // Map to response format
    const profiles: ArcProfile[] = (projects || []).map((p: any) => ({
      profile_id: p.id,
      name: p.display_name || p.name || 'Unnamed Project',
      twitter_username: p.twitter_username || p.x_handle || null,
      logo_url: p.avatar_url || null,
      arc_active: typeof p.arc_active === 'boolean' ? p.arc_active : false,
      arc_access_level: (p.arc_access_level as 'none' | 'creator_manager' | 'leaderboard' | 'gamified') || 'none',
    }));

    return res.status(200).json({
      ok: true,
      profiles,
    });
  } catch (error: any) {
    console.error('[ArcProfilesAdminAPI] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
      details: error.stack || undefined,
    });
  }
}

