/**
 * Server-Side SuperAdmin Guard for API Routes
 * 
 * Reusable authentication and authorization helper for Next.js API routes.
 * Validates session and checks SuperAdmin status.
 */

import type { NextApiRequest } from 'next';
import { getSupabaseAdmin } from '../supabase-admin';
import { isSuperAdminServerSide } from '../server-auth';

// =============================================================================
// TYPES
// =============================================================================

export type RequireSuperAdminResult =
  | {
      ok: true;
      profileId: string; // user_id from session
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
    console.error('[requireSuperAdmin] Error getting user ID from session:', err);
    return null;
  }
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Require SuperAdmin authentication for API routes
 * 
 * Validates session token, checks expiration, and verifies SuperAdmin status.
 * 
 * @param req Next.js API request
 * @returns Auth result with profileId (user_id) if authorized, or error details
 * 
 * @example
 * ```typescript
 * const auth = await requireSuperAdmin(req);
 * if (!auth.ok) {
 *   return res.status(auth.status).json({ ok: false, error: auth.error });
 * }
 * // Use auth.profileId for user_id
 * ```
 */
export async function requireSuperAdmin(
  req: NextApiRequest
): Promise<RequireSuperAdminResult> {
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

  // Check SuperAdmin status
  const isSuperAdmin = await isSuperAdminServerSide(userId);
  if (!isSuperAdmin) {
    return {
      ok: false,
      status: 403,
      error: 'superadmin_only',
    };
  }

  // User is authenticated and is SuperAdmin
  return {
    ok: true,
    profileId: userId, // user_id from session
  };
}
