/**
 * Server-Side Helper to Require Portal User Authentication
 * 
 * Uses the same authentication pattern as other working portal API endpoints.
 * Extracts akari_session cookie and validates it against akari_user_sessions table.
 * 
 * Based on the pattern used in:
 * - /api/auth/website/me.ts
 * - /api/portal/arc/my-projects.ts
 * - /api/portal/arc/permissions.ts
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '../supabase-admin';

// =============================================================================
// TYPES
// =============================================================================

export interface PortalUser {
  userId: string;
  profileId: string | null;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extract session token from cookies (same pattern as /api/auth/website/me.ts)
 * Handles edge cases: whitespace, empty values, multiple cookie headers
 */
function getSessionToken(req: NextApiRequest): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  // Handle multiple Cookie headers (shouldn't happen but be safe)
  const cookieStrings = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader];
  
  for (const cookieStr of cookieStrings) {
    const cookies = cookieStr.split(';').map(c => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith('akari_session=')) {
        const token = cookie.substring('akari_session='.length).trim();
        // Return token only if it's not empty
        return token.length > 0 ? token : null;
      }
    }
  }
  
  return null;
}

/**
 * Get user ID and profile ID from session token
 * Returns null if session is invalid or expired
 */
async function getPortalUserFromSession(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessionToken: string
): Promise<PortalUser | null> {
  // Find session in database (same pattern as /api/auth/website/me.ts)
  const { data: session, error: sessionError } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (sessionError || !session) {
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

  // Get user's Twitter username to find profile (same pattern as /api/portal/arc/my-projects.ts)
  const { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', session.user_id)
    .eq('provider', 'x')
    .single();

  let profileId: string | null = null;
  if (xIdentity?.username) {
    const cleanUsername = xIdentity.username.toLowerCase().replace('@', '').trim();
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .single();
    
    profileId = profile?.id || null;
  }

  return {
    userId: session.user_id,
    profileId,
  };
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Require authenticated portal user from request.
 * Uses the same pattern as /api/auth/website/me.ts and /api/portal/arc/my-projects.ts
 * 
 * @param req - Next.js API request
 * @param res - Next.js API response (for returning 401 if not authenticated)
 * @returns PortalUser if authenticated, or null if not authenticated (and 401 response sent)
 */
export async function requirePortalUser(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<PortalUser | null> {
  const hostname = req.headers.host || 'unknown';
  const path = req.url || 'unknown';
  const hasCookieHeader = !!req.headers.cookie;
  const sessionToken = getSessionToken(req);
  
  if (!sessionToken) {
    // Safe debug logging: only log when auth fails, don't log tokens
    console.log('[requirePortalUser] Auth failed: no session token', {
      hostname,
      path,
      hasCookieHeader,
      cookieNames: hasCookieHeader ? req.headers.cookie?.split(';').map(c => c.split('=')[0].trim()).filter(Boolean) : [],
    });
    res.status(401).json({ ok: false, error: 'Not authenticated', reason: 'not_authenticated' });
    return null;
  }

  const supabase = getSupabaseAdmin();
  const user = await getPortalUserFromSession(supabase, sessionToken);
  
  if (!user) {
    // Safe debug logging: only log when auth fails, don't log tokens
    console.log('[requirePortalUser] Auth failed: invalid or expired session', {
      hostname,
      path,
      hasSessionToken: !!sessionToken,
    });
    res.status(401).json({ ok: false, error: 'Invalid session', reason: 'not_authenticated' });
    return null;
  }

  return user;
}

