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
 * Handles duplicate cookies by preferring req.cookies (Path=/) or longest non-empty value
 */
function getSessionToken(req: NextApiRequest): string | null {
  // First, try req.cookies if Next.js has parsed it (preferred - usually Path=/)
  if (req.cookies && typeof req.cookies === 'object' && 'akari_session' in req.cookies) {
    const token = req.cookies['akari_session'];
    if (token && typeof token === 'string' && token.length > 0) {
      return token;
    }
  }

  // Fall back to parsing cookie header using cookie parser (handles URL encoding, duplicates)
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
    
    // Cookie parser handles URL decoding automatically
    return token;
  } catch (parseError) {
    // If cookie parsing fails, fall back to simple manual parsing (same as /api/auth/website/me.ts)
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
    // JWT validation failed, but don't throw - fallback to session lookup
    return null;
  }
}

/**
 * Get user ID and profile ID from session token (custom session table)
 * Returns null if session is invalid or expired
 */
async function getPortalUserFromSession(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessionToken: string
): Promise<PortalUser | null> {
  // Find session in database using SERVICE ROLE client (bypasses RLS)
  const { data: session, error: sessionError } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .maybeSingle();

  if (sessionError) {
    console.warn('[requirePortalUser] Session lookup error:', sessionError.message);
    return null;
  }

  if (!session) {
    return null;
  }

  // Check if session is expired
  const now = new Date();
  const expiresAt = new Date(session.expires_at);
  if (expiresAt < now) {
    // Clean up expired session
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    return null;
  }

  // IMPORTANT: Always return userId even if profile lookup fails
  // Profile is optional, but userId is required for authentication
  const userId = session.user_id;

  // Get user's Twitter username to find profile (optional - don't fail if missing)
  let profileId: string | null = null;
  try {
    const { data: xIdentity, error: xIdentityError } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .maybeSingle();

    if (xIdentityError) {
      console.warn('[requirePortalUser] X identity lookup error:', xIdentityError.message);
      // Continue without profile - userId is sufficient
    } else if (xIdentity?.username) {
      const cleanUsername = xIdentity.username.toLowerCase().replace('@', '').trim();
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', cleanUsername)
        .maybeSingle();
      
      if (profileError) {
        console.warn('[requirePortalUser] Profile lookup error:', profileError.message);
        // Continue without profile - userId is sufficient
      } else {
        profileId = profile?.id || null;
      }
    }
  } catch (error) {
    console.warn('[requirePortalUser] Error during profile lookup:', error);
    // Continue without profile - userId is sufficient
  }

  // Always return user with userId (profileId can be null)
  return {
    userId,
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
    sessionToken = bearerToken;
    authPath = 'bearer';
  } else {
    sessionToken = getSessionToken(req);
    if (sessionToken) {
      authPath = 'cookie';
    }
  }
  
  // TEMP: Add debug response headers (remove after confirming fix)
  const tokenLength = sessionToken ? sessionToken.length : 0;
  res.setHeader('x-akari-auth-mode', authPath);
  res.setHeader('x-akari-has-cookie-header', hasCookieHeader ? 'true' : 'false');
  res.setHeader('x-akari-has-akari-session-cookie', hasReqCookieAkariSession ? 'true' : 'false');
  res.setHeader('x-akari-has-auth-header', hasAuthHeader ? 'true' : 'false');
  res.setHeader('x-akari-token-len', tokenLength.toString());
  
  // Enhanced debug logging in production
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !sessionToken) {
    // Extract cookie names for debugging (without values)
    const cookieNames: string[] = [];
    let rawCookieHeader = '';
    if (hasCookieHeader) {
      rawCookieHeader = req.headers.cookie || '';
      try {
        const cookies = parseCookie(rawCookieHeader);
        cookieNames.push(...Object.keys(cookies));
      } catch {
        const cookies = req.headers.cookie?.split(';').map((c: string) => c.trim()) || [];
        cookieNames.push(...cookies.map((c: string) => {
          const eqIdx = c.indexOf('=');
          return eqIdx > 0 ? c.substring(0, eqIdx) : c;
        }));
      }
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
    });
  }
  
  if (!sessionToken) {
    res.status(401).json({ ok: false, error: 'Not authenticated', reason: 'not_authenticated' });
    return null;
  }

  // Determine token type
  const tokenType = looksLikeJwt(sessionToken) ? 'jwt' : 'session';
  res.setHeader('x-akari-token-type', tokenType);

  // Additional debug info when token is found
  if (isProd) {
    console.log('[requirePortalUser] Auth attempt', {
      hostname,
      path,
      authPath,
      tokenType,
      tokenLength,
      hasCookieHeader,
      hasReqCookieAkariSession,
    });
  }

  const supabase = getSupabaseAdmin();
  let userId: string | null = null;
  let user: PortalUser | null = null;
  let sessionLookup: 'hit' | 'miss' = 'miss';
  let sessionExpired: boolean = false;

  // Try JWT validation first if token looks like JWT
  if (tokenType === 'jwt') {
    userId = await validateJwtToken(supabase, sessionToken);
    if (userId) {
      // JWT validated successfully, get profile
      const { data: xIdentity } = await supabase
        .from('akari_user_identities')
        .select('username')
        .eq('user_id', userId)
        .eq('provider', 'x')
        .maybeSingle();

      let profileId: string | null = null;
      if (xIdentity?.username) {
        const cleanUsername = xIdentity.username.toLowerCase().replace('@', '').trim();
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', cleanUsername)
          .maybeSingle();
        
        profileId = profile?.id || null;
      }

      user = { userId, profileId };
      sessionLookup = 'hit';
    }
    // If JWT validation fails, fall through to session table lookup
  }

  // If JWT validation failed or token is not JWT, try session table lookup
  if (!user) {
    // First check if session exists in DB (for debug header)
    const { data: sessionCheck, error: sessionCheckError } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .maybeSingle();
    
    if (sessionCheck) {
      sessionLookup = 'hit';
      sessionExpired = new Date(sessionCheck.expires_at) < new Date();
      
      // Only try to get user if session is not expired
      if (!sessionExpired) {
        const sessionUser = await getPortalUserFromSession(supabase, sessionToken);
        if (sessionUser) {
          user = sessionUser;
        } else {
          // Session exists but getPortalUserFromSession returned null - log why
          if (isProd) {
            console.log('[requirePortalUser] Session found but getPortalUserFromSession returned null', {
              hostname,
              path,
              userId: sessionCheck.user_id,
              expiresAt: sessionCheck.expires_at,
            });
          }
        }
      }
    } else {
      // Session not found in DB
      if (isProd && sessionCheckError) {
        console.log('[requirePortalUser] Session lookup error', {
          hostname,
          path,
          error: sessionCheckError.message,
        });
      }
    }
  }

  // Set debug headers
  res.setHeader('x-akari-session-lookup', sessionLookup);
  res.setHeader('x-akari-session-expired', sessionExpired ? 'true' : 'false');
  
  if (!user) {
    // Enhanced debug logging: check what went wrong
    if (isProd) {
      console.log('[requirePortalUser] Auth failed: invalid or expired session', {
        hostname,
        path,
        authPath,
        tokenType,
        tokenLength,
        hasSessionToken: !!sessionToken,
        sessionLookup,
        sessionExpired,
      });
    }
    res.status(401).json({ ok: false, error: 'Invalid session', reason: 'not_authenticated' });
    return null;
  }

  return user;
}

