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
 * Get user ID from Bearer token
 * The app uses custom akari_session tokens, not Supabase JWT.
 * So we directly look up the token in akari_user_sessions table.
 */
async function getUserIdFromBearerToken(token: string): Promise<string | null> {
  // The app uses custom session tokens, not Supabase Auth JWT
  // So we directly look up the token in the database
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

  // Not authenticated
  return null;
}

