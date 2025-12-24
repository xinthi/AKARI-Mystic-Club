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
 * Extract Bearer token from Authorization header
 */
function getBearerToken(req: NextApiRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    return token.length > 0 ? token : null;
  }
  
  return null;
}

/**
 * Extract session token from cookies
 * EXACT COPY of /api/auth/website/me.ts getSessionToken function (which works in production)
 * Do not modify this logic - it must match exactly
 */
function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map((c: string) => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
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
 * Supports both Authorization Bearer token and akari_session cookie.
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
  const hasAuthHeader = !!req.headers.authorization;
  const hasReqCookieAkariSession = !!(req.cookies && typeof req.cookies === 'object' && 'akari_session' in req.cookies);
  
  // Try Bearer token first, then fall back to cookie
  let sessionToken: string | null = null;
  let authPath: 'bearer' | 'cookie' | 'none' = 'none';
  
  const bearerToken = getBearerToken(req);
  if (bearerToken) {
    // If Bearer token is provided, treat it as akari_session token
    // (In the future, this could validate a JWT, but for now we use session tokens)
    sessionToken = bearerToken;
    authPath = 'bearer';
  } else {
    // Fall back to cookie-based auth
    sessionToken = getSessionToken(req);
    if (sessionToken) {
      authPath = 'cookie';
    }
  }
  
  // Enhanced debug logging in production
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !sessionToken) {
    // Extract cookie names for debugging (without values)
    const cookieNames: string[] = [];
    let rawCookieHeader = '';
    if (hasCookieHeader) {
      rawCookieHeader = req.headers.cookie || '';
      const cookies = req.headers.cookie?.split(';').map((c: string) => c.trim()) || [];
      cookieNames.push(...cookies.map((c: string) => {
        const eqIdx = c.indexOf('=');
        return eqIdx > 0 ? c.substring(0, eqIdx) : c;
      }));
    }
    
    console.log('[requirePortalUser] Auth failed: no session token', {
      hostname,
      path,
      hasCookieHeader,
      hasAuthHeader,
      hasReqCookieAkariSession,
      cookieNames,
      authPath,
      rawCookieHeaderLength: rawCookieHeader.length,
      rawCookieHeaderPrefix: rawCookieHeader.substring(0, 100), // First 100 chars for debugging
    });
  }
  
  if (!sessionToken) {
    res.status(401).json({ ok: false, error: 'Not authenticated', reason: 'not_authenticated' });
    return null;
  }

  // Additional debug info when token is found
  const tokenLength = sessionToken.length;
  const tokenPrefix = tokenLength > 8 ? sessionToken.substring(0, 8) : 'short';
  
  if (isProd) {
    console.log('[requirePortalUser] Auth attempt', {
      hostname,
      path,
      authPath,
      tokenLength,
      tokenPrefix,
      hasCookieHeader,
      hasReqCookieAkariSession,
    });
  }

  const supabase = getSupabaseAdmin();
  const user = await getPortalUserFromSession(supabase, sessionToken);
  
  if (!user) {
    // Enhanced debug logging: check what went wrong in session lookup
    if (isProd) {
      // Try to see if session exists in DB
      const { data: sessionCheck, error: sessionCheckError } = await supabase
        .from('akari_user_sessions')
        .select('user_id, expires_at')
        .eq('session_token', sessionToken)
        .maybeSingle();
      
      console.log('[requirePortalUser] Auth failed: invalid or expired session', {
        hostname,
        path,
        authPath,
        tokenLength,
        tokenPrefix,
        hasSessionToken: !!sessionToken,
        sessionExists: !!sessionCheck,
        sessionError: sessionCheckError?.message || null,
        sessionExpired: sessionCheck ? new Date(sessionCheck.expires_at) < new Date() : null,
      });
    }
    res.status(401).json({ ok: false, error: 'Invalid session', reason: 'not_authenticated' });
    return null;
  }

  return user;
}

