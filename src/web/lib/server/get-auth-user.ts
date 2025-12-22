/**
 * Server-Side Authentication Helper for API Routes
 * 
 * Supports both Bearer token (Authorization header) and cookie-based authentication.
 * Returns userId if authenticated, null otherwise.
 */

import type { NextApiRequest } from 'next';
import { getSupabaseAdmin } from '../supabase-admin';
import { createPortalClient } from '../portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

export interface AuthUserResult {
  userId: string;
  method: 'bearer' | 'cookie';
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extract Bearer token from Authorization header
 */
function getBearerToken(req: NextApiRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim();
}

/**
 * Extract session token from cookies
 */
function getSessionTokenFromCookie(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

/**
 * Check if a token looks like a Supabase JWT (starts with "eyJ" which is base64-encoded JSON)
 */
function looksLikeJWT(token: string): boolean {
  return token.startsWith('eyJ');
}

/**
 * Get user ID from Bearer token
 * Tries Supabase Auth JWT first (if token looks like JWT), then falls back to custom akari_session token lookup
 */
async function getUserIdFromBearerToken(token: string): Promise<string | null> {
  // If token looks like a JWT, try Supabase Auth first
  if (looksLikeJWT(token)) {
    try {
      const supabase = createPortalClient();
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (!error && user && user.id) {
        return user.id;
      }
    } catch (err) {
      // Supabase Auth failed - fall through to session token lookup
    }
  }
  
  // If Supabase auth fails or token is not a JWT, treat token as akari_session token
  // and look it up in the database
  return await getUserIdFromSessionToken(token);
}

/**
 * Get user ID from cookie session token
 */
async function getUserIdFromSessionToken(sessionToken: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    
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

    return session.user_id;
  } catch (err) {
    console.error('[getUserIdFromSessionToken] Error:', err);
    return null;
  }
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Get authenticated user ID from request.
 * Tries Bearer token first, then falls back to cookie session.
 * 
 * @param req - Next.js API request
 * @returns AuthUserResult with userId and method, or null if not authenticated
 */
export async function getAuthUser(req: NextApiRequest): Promise<AuthUserResult | null> {
  // Try Bearer token first
  const bearerToken = getBearerToken(req);
  if (bearerToken) {
    const userId = await getUserIdFromBearerToken(bearerToken);
    if (userId) {
      return { userId, method: 'bearer' };
    }
  }

  // Fall back to cookie session
  const sessionToken = getSessionTokenFromCookie(req);
  if (sessionToken) {
    const userId = await getUserIdFromSessionToken(sessionToken);
    if (userId) {
      return { userId, method: 'cookie' };
    }
  }

  // Not authenticated - log for debugging in production
  if (process.env.NODE_ENV === 'production') {
    console.log('[getAuthUser] No authentication found', {
      hasBearer: !!bearerToken,
      hasCookie: !!sessionToken,
      authHeader: req.headers.authorization ? 'present' : 'missing',
      cookieHeader: req.headers.cookie ? 'present' : 'missing',
    });
  }

  return null;
}

