/**
 * ARC API Tier Guard
 * 
 * Helper functions for enforcing tier-based access control in ARC API endpoints.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '../supabase-admin';
import { getUserTierServerSide } from '../server-auth';
import { getRequiredTierForApi, tierMeetsRequirement, getTierDisplayName } from './access-policy';

// =============================================================================
// SESSION HELPERS
// =============================================================================

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

async function getUserIdFromSession(sessionToken: string): Promise<string | null> {
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
      await supabase
        .from('akari_user_sessions')
        .delete()
        .eq('session_token', sessionToken);
      return null;
    }

    return session.user_id;
  } catch (err) {
    console.error('[getUserIdFromSession] Error:', err);
    return null;
  }
}

async function isSuperAdminServerSide(userId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();

    // Check akari_user_roles table
    const { data: userRoles } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin');

    if (userRoles && userRoles.length > 0) {
      return true;
    }

    // Also check profiles.real_roles via Twitter username
    const { data: xIdentity } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .single();

    if (xIdentity?.username) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('real_roles')
        .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
        .single();

      if (profile?.real_roles?.includes('super_admin')) {
        return true;
      }
    }

    return false;
  } catch (err: any) {
    console.error('[isSuperAdminServerSide] Error:', err);
    return false;
  }
}

// =============================================================================
// TIER GUARD
// =============================================================================

export interface TierGuardResult {
  allowed: boolean;
  userId?: string;
  userTier?: 'seer' | 'analyst' | 'institutional_plus';
  reason?: string;
}

/**
 * Check if user has required tier for an ARC API endpoint.
 * Returns result with allowed status and user info.
 * 
 * DEV MODE: Always allows access (bypasses checks)
 */
export async function checkArcApiTier(
  req: NextApiRequest,
  apiRoute: string
): Promise<TierGuardResult> {
  const isDevMode = process.env.NODE_ENV === 'development';
  
  // DEV MODE: Allow access
  if (isDevMode) {
    return { allowed: true };
  }
  
  // Get required tier for this API route
  const requiredTier = getRequiredTierForApi(apiRoute);
  
  // If route is not in policy, default deny
  if (!requiredTier) {
    return {
      allowed: false,
      reason: `Route ${apiRoute} is not in ARC access policy`,
    };
  }
  
  // Get session token
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return {
      allowed: false,
      reason: 'Not authenticated',
    };
  }
  
  // Get user ID from session
  const userId = await getUserIdFromSession(sessionToken);
  if (!userId) {
    return {
      allowed: false,
      reason: 'Invalid session',
    };
  }
  
  // Super admins bypass tier checks
  const isSuperAdmin = await isSuperAdminServerSide(userId);
  if (isSuperAdmin) {
    return {
      allowed: true,
      userId,
      userTier: 'institutional_plus',
    };
  }
  
  // Get user tier
  const userTier = await getUserTierServerSide(userId);
  
  // Check if tier meets requirement
  if (!tierMeetsRequirement(userTier, requiredTier)) {
    return {
      allowed: false,
      userId,
      userTier,
      reason: `Requires ${getTierDisplayName(requiredTier)} tier, but user has ${getTierDisplayName(userTier)} tier`,
    };
  }
  
  // User has required tier
  return {
    allowed: true,
    userId,
    userTier,
  };
}

/**
 * Enforce tier guard in API handler.
 * Returns 403 response if access denied, or null if allowed.
 */
export async function enforceArcApiTier(
  req: NextApiRequest,
  res: NextApiResponse,
  apiRoute: string
): Promise<NextApiResponse | null> {
  const guardResult = await checkArcApiTier(req, apiRoute);
  
  if (!guardResult.allowed) {
    return res.status(403).json({
      ok: false,
      error: guardResult.reason || 'Access denied',
      reason: guardResult.reason,
    });
  }
  
  return null; // Access allowed
}

