/**
 * Server-Side Project Role Guard for API Routes
 * 
 * Reusable authentication and authorization helper for Next.js API routes.
 * Validates session and checks if user has required role on a project.
 */

import type { NextApiRequest } from 'next';
import { getSupabaseAdmin } from '../supabase-admin';
import { isSuperAdminServerSide } from '../server-auth';

// =============================================================================
// TYPES
// =============================================================================

export type ProjectRole = 'founder' | 'admin' | 'moderator';

export type RequireProjectRoleResult =
  | {
      ok: true;
      profileId: string; // user_id from session
      role: ProjectRole;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extract session token from request cookies
 */
function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

/**
 * Get user ID from session token
 */
async function getUserIdFromSession(sessionToken: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: session, error } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (error || !session) {
      return null;
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      // Clean up expired session
      await supabase
        .from('akari_user_sessions')
        .delete()
        .eq('session_token', sessionToken);
      return null;
    }

    return session.user_id;
  } catch (err) {
    console.error('[requireProjectRole] Error getting user ID from session:', err);
    return null;
  }
}

/**
 * Get profile ID from user ID (via Twitter username)
 */
async function getProfileIdFromUserId(userId: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    
    // Get Twitter username
    const { data: xIdentity, error: identityError } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .single();

    if (identityError || !xIdentity?.username) {
      return null;
    }

    const cleanUsername = xIdentity.username.toLowerCase().replace('@', '').trim();
    
    // Get profile ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .single();

    if (profileError || !profile) {
      return null;
    }

    return profile.id;
  } catch (err) {
    console.error('[requireProjectRole] Error getting profile ID from user ID:', err);
    return null;
  }
}

/**
 * Map ProjectRole to database role
 * 'founder' maps to 'owner' in project_team_members table
 */
function mapRoleToDbRole(role: ProjectRole): 'owner' | 'admin' | 'moderator' {
  if (role === 'founder') {
    return 'owner';
  }
  return role;
}

/**
 * Map database role to ProjectRole
 * 'owner' maps to 'founder' in ProjectRole type
 */
function mapDbRoleToProjectRole(dbRole: string): ProjectRole | null {
  if (dbRole === 'owner') {
    return 'founder';
  }
  if (dbRole === 'admin' || dbRole === 'moderator') {
    return dbRole as ProjectRole;
  }
  return null;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Require project role authentication for API routes
 * 
 * Validates session token, checks expiration, and verifies user has required role
 * on the specified project via project_team_members table.
 * 
 * @param req Next.js API request
 * @param projectId Project UUID
 * @param allowedRoles Array of allowed roles (founder/admin/moderator)
 * @returns Auth result with profileId (user_id) and role if authorized, or error details
 * 
 * @example
 * ```typescript
 * const auth = await requireProjectRole(req, projectId, ['founder', 'admin', 'moderator']);
 * if (!auth.ok) {
 *   return res.status(auth.status).json({ ok: false, error: auth.error });
 * }
 * // Use auth.profileId for user_id, auth.role for the user's role
 * ```
 */
export async function requireProjectRole(
  req: NextApiRequest,
  projectId: string,
  allowedRoles: ProjectRole[]
): Promise<RequireProjectRoleResult> {
  // Extract session token
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return {
      ok: false,
      status: 401,
      error: 'not_authenticated',
    };
  }

  // Get user ID from session
  const userId = await getUserIdFromSession(sessionToken);
  if (!userId) {
    return {
      ok: false,
      status: 401,
      error: 'not_authenticated',
    };
  }

  // Check if user is SuperAdmin (bypass project role check)
  const isSuperAdmin = await isSuperAdminServerSide(userId);
  if (isSuperAdmin) {
    // SuperAdmin can access any project, return 'founder' as the role
    return {
      ok: true,
      profileId: userId,
      role: 'founder',
    };
  }

  // Get profile ID from user ID
  const profileId = await getProfileIdFromUserId(userId);
  if (!profileId) {
    return {
      ok: false,
      status: 403,
      error: 'not_project_team',
    };
  }

  // Map allowed roles to database roles
  const allowedDbRoles = allowedRoles.map(mapRoleToDbRole);

  // Query project_team_members for user's role on this project
  const supabase = getSupabaseAdmin();
  const { data: teamMember, error: teamError } = await supabase
    .from('project_team_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('profile_id', profileId)
    .in('role', allowedDbRoles)
    .maybeSingle();

  if (teamError) {
    console.error('[requireProjectRole] Error querying project_team_members:', teamError);
    return {
      ok: false,
      status: 500,
      error: 'Failed to check project role',
    };
  }

  if (!teamMember) {
    return {
      ok: false,
      status: 403,
      error: 'not_project_team',
    };
  }

  // Map database role back to ProjectRole
  const userRole = mapDbRoleToProjectRole(teamMember.role);
  if (!userRole) {
    return {
      ok: false,
      status: 403,
      error: 'insufficient_role',
    };
  }

  // User has required role
  return {
    ok: true,
    profileId: userId,
    role: userRole,
  };
}
