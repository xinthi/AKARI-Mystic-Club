/**
 * Server-Side Authentication Helpers
 * 
 * Utilities for checking authentication and permissions in getServerSideProps
 * and other server-side contexts.
 */

import { GetServerSidePropsContext } from 'next';
import { getSupabaseAdmin } from './supabase-admin';

// =============================================================================
// SESSION HELPERS
// =============================================================================

/**
 * Extract session token from request cookies
 */
export function getSessionTokenFromRequest(req: GetServerSidePropsContext['req']): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

/**
 * Validate session and get user ID
 */
export async function getUserIdFromSession(sessionToken: string): Promise<string | null> {
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
    console.error('[getUserIdFromSession] Error:', err);
    return null;
  }
}

// =============================================================================
// PERMISSION CHECKS
// =============================================================================

/**
 * Check if user is Super Admin
 * Checks both akari_user_roles and profiles.real_roles
 */
export async function isSuperAdminServerSide(userId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();

    // Check akari_user_roles table
    const { data: userRoles, error: rolesError } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin');

    if (rolesError) {
      console.error('[isSuperAdminServerSide] Error checking akari_user_roles:', rolesError);
      // Continue to check profiles.real_roles as fallback
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
      console.error('[isSuperAdminServerSide] Error checking akari_user_identities:', identityError);
      return false;
    }

    if (xIdentity?.username) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('real_roles')
        .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
        .single();

      if (profileError) {
        console.error('[isSuperAdminServerSide] Error checking profiles:', profileError);
        return false;
      }

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
// GETSERVER SIDE PROPS HELPERS
// =============================================================================

/**
 * Check authentication and Super Admin status for admin pages
 * Returns redirect or null if authorized
 */
export async function requireSuperAdmin(
  context: GetServerSidePropsContext
): Promise<{ redirect: { destination: string; permanent: boolean } } | null> {
  const isDevMode = process.env.NODE_ENV === 'development';
  
  // In dev mode, allow access (can be restricted later if needed)
  if (isDevMode) {
    return null;
  }

  // Check for session token
  const sessionToken = getSessionTokenFromRequest(context.req);
  if (!sessionToken) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[requireSuperAdmin] SSR redirect triggered: No session token');
    }
    return {
      redirect: {
        destination: '/portal?error=access_denied',
        permanent: false,
      },
    };
  }

  // Get user ID from session
  const userId = await getUserIdFromSession(sessionToken);
  if (!userId) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[requireSuperAdmin] SSR redirect triggered: Invalid session');
    }
    return {
      redirect: {
        destination: '/portal?error=access_denied',
        permanent: false,
      },
    };
  }

  // Check if user is Super Admin
  const isSuperAdmin = await isSuperAdminServerSide(userId);
  if (!isSuperAdmin) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[requireSuperAdmin] SSR redirect triggered: User is not SuperAdmin', { userId });
    }
    return {
      redirect: {
        destination: '/portal?error=access_denied',
        permanent: false,
      },
    };
  }

  // User is authenticated and is Super Admin
  return null;
}

/**
 * Compute user tier from feature grants (server-side)
 * Matches the logic in getUserTier() but works with raw DB data
 */
export async function getUserTierServerSide(userId: string): Promise<'seer' | 'analyst' | 'institutional_plus'> {
  try {
    const supabase = getSupabaseAdmin();
    
    // Check if user is super admin or admin (auto-institutional_plus)
    const isSuperAdmin = await isSuperAdminServerSide(userId);
    if (isSuperAdmin) {
      return 'institutional_plus';
    }
    
    // Check for admin role
    const { data: adminRoles } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin');
    
    if (adminRoles && adminRoles.length > 0) {
      return 'institutional_plus';
    }
    
    // Get feature grants
    const { data: grants } = await supabase
      .from('akari_user_feature_grants')
      .select('feature_key, starts_at, ends_at')
      .eq('user_id', userId);
    
    if (!grants || grants.length === 0) {
      return 'seer';
    }
    
    const now = new Date();
    
    // Check for Institutional Plus features
    for (const grant of grants) {
      const startsOk = !grant.starts_at || new Date(grant.starts_at) <= now;
      const endsOk = !grant.ends_at || new Date(grant.ends_at) >= now;
      
      if (startsOk && endsOk) {
        if (grant.feature_key === 'deep.explorer' || grant.feature_key === 'institutional.plus') {
          return 'institutional_plus';
        }
      }
    }
    
    // Check for Analyst features
    for (const grant of grants) {
      const startsOk = !grant.starts_at || new Date(grant.starts_at) <= now;
      const endsOk = !grant.ends_at || new Date(grant.ends_at) >= now;
      
      if (startsOk && endsOk) {
        if (grant.feature_key === 'markets.analytics' || 
            grant.feature_key === 'sentiment.compare' || 
            grant.feature_key === 'sentiment.search') {
          return 'analyst';
        }
      }
    }
    
    // Check for analyst role
    const { data: analystRoles } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'analyst');
    
    if (analystRoles && analystRoles.length > 0) {
      return 'analyst';
    }
    
    return 'seer';
  } catch (err: any) {
    console.error('[getUserTierServerSide] Error:', err);
    return 'seer'; // Default to seer on error
  }
}

/**
 * Check authentication and tier requirement for ARC pages
 * Returns redirect or null if authorized
 */
export async function requireArcTier(
  context: GetServerSidePropsContext,
  requiredTier: 'seer' | 'analyst' | 'institutional_plus',
  route: string
): Promise<{ redirect: { destination: string; permanent: boolean } } | null> {
  const isDevMode = process.env.NODE_ENV === 'development';
  
  // In dev mode, allow access
  if (isDevMode) {
    return null;
  }
  
  // Check for session token
  const sessionToken = getSessionTokenFromRequest(context.req);
  if (!sessionToken) {
    return {
      redirect: {
        destination: `/portal?error=access_denied&required_tier=${requiredTier}&route=${encodeURIComponent(route)}`,
        permanent: false,
      },
    };
  }
  
  // Get user ID from session
  const userId = await getUserIdFromSession(sessionToken);
  if (!userId) {
    return {
      redirect: {
        destination: `/portal?error=access_denied&required_tier=${requiredTier}&route=${encodeURIComponent(route)}`,
        permanent: false,
      },
    };
  }
  
  // Super admins bypass tier checks
  const isSuperAdmin = await isSuperAdminServerSide(userId);
  if (isSuperAdmin) {
    return null;
  }
  
  // Get user tier
  const userTier = await getUserTierServerSide(userId);
  
  // Check if tier meets requirement
  const tierHierarchy: Array<'seer' | 'analyst' | 'institutional_plus'> = ['seer', 'analyst', 'institutional_plus'];
  const userIndex = tierHierarchy.indexOf(userTier);
  const requiredIndex = tierHierarchy.indexOf(requiredTier);
  
  if (userIndex < requiredIndex) {
    return {
      redirect: {
        destination: `/portal/pricing?upgrade=${requiredTier}&from=${encodeURIComponent(route)}`,
        permanent: false,
      },
    };
  }
  
  // User has required tier
  return null;
}

