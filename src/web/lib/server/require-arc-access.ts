/**
 * Server-side ARC Access Check
 * 
 * Checks if a user has ARC access based on approved arc_project_access rows.
 * Used for route protection instead of tier-based checks.
 */

import { GetServerSidePropsContext } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getSessionTokenFromRequest, getUserIdFromSession, isSuperAdminServerSide } from '@/lib/server-auth';

/**
 * Check if user has any approved ARC access
 * Returns true if:
 * - User is superadmin, OR
 * - User is a portal user (logged in) AND there exists at least one approved arc_project_access row
 *   (we allow any portal user to view ARC if any project has approved access)
 */
export async function hasAnyApprovedArcAccess(userId: string): Promise<boolean> {
  // Super admins always have access
  const isSuperAdmin = await isSuperAdminServerSide(userId);
  if (isSuperAdmin) {
    return true;
  }

  const supabase = getSupabaseAdmin();

  // Check if user is a portal user (has akari_user_identities row)
  const { data: identity } = await supabase
    .from('akari_user_identities')
    .select('profile_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!identity) {
    return false; // Not a portal user
  }

  // Check if there exists at least one approved arc_project_access row
  // This allows any portal user to view the ARC overview page
  const { data: approvedAccess } = await supabase
    .from('arc_project_access')
    .select('id')
    .eq('application_status', 'approved')
    .limit(1)
    .maybeSingle();

  return !!approvedAccess;
}

/**
 * Check if user has approved ARC access for a specific project
 * Returns true if:
 * - User is superadmin, OR
 * - Project has approved ARC access (any portal user can view approved projects)
 */
export async function hasApprovedArcAccessForProject(
  userId: string,
  projectId: string
): Promise<boolean> {
  // Super admins always have access
  const isSuperAdmin = await isSuperAdminServerSide(userId);
  if (isSuperAdmin) {
    return true;
  }

  const supabase = getSupabaseAdmin();

  // Check if user is a portal user
  const { data: identity } = await supabase
    .from('akari_user_identities')
    .select('profile_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!identity) {
    return false; // Not a portal user
  }

  // Check if project has approved ARC access
  const { data: access } = await supabase
    .from('arc_project_access')
    .select('application_status')
    .eq('project_id', projectId)
    .eq('application_status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return !!access;
}

/**
 * Require ARC access for a route
 * Returns redirect or null if authorized
 */
export async function requireArcAccessRoute(
  context: GetServerSidePropsContext,
  route: string,
  projectId?: string
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
        destination: `/portal?error=access_denied&route=${encodeURIComponent(route)}`,
        permanent: false,
      },
    };
  }

  // Get user ID from session
  const userId = await getUserIdFromSession(sessionToken);
  if (!userId) {
    return {
      redirect: {
        destination: `/portal?error=access_denied&route=${encodeURIComponent(route)}`,
        permanent: false,
      },
    };
  }

  // Super admins bypass checks
  const isSuperAdmin = await isSuperAdminServerSide(userId);
  if (isSuperAdmin) {
    return null;
  }

  // Check ARC access
  if (projectId) {
    // Check access for specific project
    const hasAccess = await hasApprovedArcAccessForProject(userId, projectId);
    if (!hasAccess) {
      return {
        redirect: {
          destination: `/portal?error=access_denied&route=${encodeURIComponent(route)}`,
          permanent: false,
        },
      };
    }
  } else {
    // Check if user has any approved ARC access
    const hasAccess = await hasAnyApprovedArcAccess(userId);
    if (!hasAccess) {
      return {
        redirect: {
          destination: `/portal?error=access_denied&route=${encodeURIComponent(route)}`,
          permanent: false,
        },
      };
    }
  }

  return null;
}
