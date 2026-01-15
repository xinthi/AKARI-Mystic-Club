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
import { parse as parseCookie } from 'cookie';
import { getSupabaseAdmin } from '../supabase-admin';

// =============================================================================
// TYPES
// =============================================================================

export interface PortalUser {
  userId: string;
  profileId: string | null;
}

type AuthFailReason = 
  | 'no_cookie' 
  | 'invalid_cookie' 
  | 'session_miss' 
  | 'session_expired' 
  | 'db_error' 
  | 'user_missing'
  | 'none';

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
 * Prefers req.cookies (Next.js parsed) first, then falls back to cookie parser
 */
function getSessionToken(req: NextApiRequest): string | null {
  // First, try req.cookies if Next.js has parsed it (preferred - usually Path=/)
  if (req.cookies && typeof req.cookies === 'object' && 'akari_session' in req.cookies) {
    const token = req.cookies['akari_session'];
    if (token && typeof token === 'string' && token.length > 0) {
      return token;
    }
  }

  // Fall back to parsing cookie header using cookie parser
  const cookieHeader = req.headers.cookie ?? '';
  if (!cookieHeader) {
    return null;
  }

  try {
    const cookies = parseCookie(cookieHeader);
    const token = cookies['akari_session'] ?? null;
    
    if (!token || typeof token !== 'string' || token.length === 0) {
      return null;
    }
    
    return token;
  } catch (parseError) {
    // If cookie parsing fails, fall back to simple manual parsing
    const cookies = cookieHeader.split(';').map((c: string) => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith('akari_session=')) {
        return cookie.substring('akari_session='.length);
      }
    }
    return null;
  }
}

/**
 * Check if token looks like a JWT (3 dot-separated parts)
 */
function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}

/**
 * Ensure a profile row exists for a given X username and return the profile ID.
 */
async function ensureProfileForUsername(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  username: string
): Promise<string | null> {
  const cleanUsername = username.toLowerCase().replace('@', '').trim();
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', cleanUsername)
    .maybeSingle();

  if (existingProfile?.id) {
    return existingProfile.id;
  }

  const { data: newProfile, error: createError } = await supabase
    .from('profiles')
    .insert({
      username: cleanUsername,
      name: cleanUsername,
      real_roles: ['user'],
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (createError || !newProfile) {
    return null;
  }

  return newProfile.id;
}

/**
 * Try to validate JWT token using Supabase Auth
 * Returns userId if valid, null if invalid (but does not throw)
 */
async function validateJwtToken(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  token: string
): Promise<string | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return null;
    }
    return user.id;
  } catch (error) {
    return null;
  }
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Require authenticated portal user from request.
 * Supports both Authorization Bearer token and akari_session cookie.
 * 
 * ALWAYS sets debug headers, even on 401 responses.
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
  
  // Initialize debug headers (will be set before any return)
  let authMode: 'cookie' | 'bearer' | 'none' = 'none';
  let tokenLength = 0;
  let sessionLookup: 'hit' | 'miss' | 'error' = 'miss';
  let sessionExpired: 'true' | 'false' | 'unknown' = 'unknown';
  let authUserId: 'present' | 'missing' = 'missing';
  let failReason: AuthFailReason = 'none';
  
  // Helper to set all debug headers
  const setDebugHeaders = () => {
    res.setHeader('x-akari-auth-mode', authMode);
    res.setHeader('x-akari-has-cookie-header', hasCookieHeader ? 'true' : 'false');
    res.setHeader('x-akari-has-akari-session-cookie', hasReqCookieAkariSession ? 'true' : 'false');
    res.setHeader('x-akari-token-len', tokenLength.toString());
    res.setHeader('x-akari-session-lookup', sessionLookup);
    res.setHeader('x-akari-session-expired', sessionExpired);
    res.setHeader('x-akari-auth-userid', authUserId);
    res.setHeader('x-akari-auth-fail-reason', failReason);
  };
  
  // Try Bearer token first, then fall back to cookie
  let sessionToken: string | null = null;
  
  const bearerToken = getBearerToken(req);
  if (bearerToken) {
    sessionToken = bearerToken;
    authMode = 'bearer';
    tokenLength = sessionToken.length;
  } else {
    sessionToken = getSessionToken(req);
    if (sessionToken) {
      authMode = 'cookie';
      tokenLength = sessionToken.length;
    } else {
      authMode = 'none';
      failReason = hasCookieHeader ? 'invalid_cookie' : 'no_cookie';
      setDebugHeaders();
      res.status(401).json({ 
        ok: false, 
        error: 'Not authenticated', 
        reason: failReason 
      });
      return null;
    }
  }
  
  // Determine token type
  const tokenType = looksLikeJwt(sessionToken) ? 'jwt' : 'session';
  res.setHeader('x-akari-token-type', tokenType);

  const supabase = getSupabaseAdmin();
  let user: PortalUser | null = null;

  // Try JWT validation first if token looks like JWT
  if (tokenType === 'jwt') {
    const jwtUserId = await validateJwtToken(supabase, sessionToken);
    if (jwtUserId) {
      // JWT validated successfully, get profile (optional)
      let profileId: string | null = null;
      try {
        const { data: xIdentity } = await supabase
          .from('akari_user_identities')
          .select('username')
          .eq('user_id', jwtUserId)
          .eq('provider', 'x')
          .maybeSingle();

        if (xIdentity?.username) {
          profileId = await ensureProfileForUsername(supabase, xIdentity.username);
        }
      } catch (error) {
        // Profile lookup failed - non-fatal, continue with userId only
      }

      user = { userId: jwtUserId, profileId };
      sessionLookup = 'hit';
      sessionExpired = 'false';
      authUserId = 'present';
      failReason = 'none';
      setDebugHeaders();
      return user;
    }
    // If JWT validation fails, fall through to session table lookup
  }

  // Session token lookup (custom session table)
  try {
    const { data: sessionCheck, error: sessionCheckError } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .maybeSingle();
    
    if (sessionCheckError) {
      // Database error
      sessionLookup = 'error';
      failReason = 'db_error';
      setDebugHeaders();
      res.status(401).json({ 
        ok: false, 
        error: 'Invalid session', 
        reason: failReason 
      });
      return null;
    }
    
    if (!sessionCheck) {
      // Session not found in database
      sessionLookup = 'miss';
      failReason = 'session_miss';
      setDebugHeaders();
      res.status(401).json({ 
        ok: false, 
        error: 'Invalid session', 
        reason: failReason 
      });
      return null;
    }
    
    // Session exists - check expiration
    sessionLookup = 'hit';
    const now = new Date();
    const expiresAt = new Date(sessionCheck.expires_at);
    
    if (expiresAt < now) {
      // Session expired - clean it up
      sessionExpired = 'true';
      failReason = 'session_expired';
      await supabase
        .from('akari_user_sessions')
        .delete()
        .eq('session_token', sessionToken);
      setDebugHeaders();
      res.status(401).json({ 
        ok: false, 
        error: 'Invalid session', 
        reason: failReason 
      });
      return null;
    }
    
    // Session is valid and not expired - ALWAYS return user
    sessionExpired = 'false';
    const sessionUserId: string = sessionCheck.user_id;
    
    // Ensure userId is not null (should never happen, but TypeScript safety)
    if (!sessionUserId) {
      failReason = 'user_missing';
      setDebugHeaders();
      res.status(401).json({ 
        ok: false, 
        error: 'Invalid session', 
        reason: failReason 
      });
      return null;
    }
    
    // Get profile (optional - don't fail if missing)
    let profileId: string | null = null;
    try {
      const { data: xIdentity, error: xIdentityError } = await supabase
        .from('akari_user_identities')
        .select('username')
        .eq('user_id', sessionUserId)
        .eq('provider', 'x')
        .maybeSingle();

      if (!xIdentityError && xIdentity?.username) {
        profileId = await ensureProfileForUsername(supabase, xIdentity.username);
      }
    } catch (error) {
      // Profile lookup failed - non-fatal, continue with userId only
    }

    // ALWAYS return user if session is valid - profile is optional
    user = { userId: sessionUserId, profileId };
    authUserId = 'present';
    failReason = 'none';
    setDebugHeaders();
    return user;
    
  } catch (error: any) {
    // Unexpected error during session lookup
    sessionLookup = 'error';
    failReason = 'db_error';
    setDebugHeaders();
    res.status(401).json({ 
      ok: false, 
      error: 'Invalid session', 
      reason: failReason 
    });
    return null;
  }
}
