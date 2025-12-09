/**
 * API Route: GET /api/portal/admin/overview
 * 
 * Returns high-level stats and recent data for super admin dashboard.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface AdminOverviewStats {
  totalUsers: number;
  trackedProjects: number;
  deepExplorerUsers: number;
  institutionalPlusUsers: number;
}

interface RecentUser {
  id: string;
  displayName: string | null;
  createdAt: string;
  xUsername: string | null;
}

interface RecentProject {
  id: string;
  name: string;
  slug: string;
  xHandle: string | null;
  createdAt: string;
}

type AdminOverviewResponse =
  | {
      ok: true;
      stats: AdminOverviewStats;
      recentUsers: RecentUser[];
      recentProjects: RecentProject[];
    }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

async function checkSuperAdmin(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<boolean> {
  const { data: roles } = await supabase
    .from('akari_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');

  return (roles?.length ?? 0) > 0;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminOverviewResponse>
) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Get session token
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Validate session and get user ID
    const { data: session, error: sessionError } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from('akari_user_sessions')
        .delete()
        .eq('session_token', sessionToken);
      return res.status(401).json({ ok: false, error: 'Session expired' });
    }

    const userId = session.user_id;

    // Check if user is super admin
    const isSuperAdmin = await checkSuperAdmin(supabase, userId);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    // Fetch all stats in parallel
    const [
      totalUsersResult,
      trackedProjectsResult,
      deepExplorerUsersResult,
      institutionalPlusUsersResult,
      recentUsersResult,
      recentProjectsResult,
    ] = await Promise.all([
      // Total users count
      supabase
        .from('akari_users')
        .select('id', { count: 'exact', head: true }),
      
      // Tracked projects count
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true }),
      
      // Deep Explorer users count (distinct user_id where feature_key = 'deep.explorer')
      supabase
        .from('akari_user_feature_grants')
        .select('user_id', { count: 'exact' })
        .eq('feature_key', 'deep.explorer'),
      
      // Institutional Plus users count (distinct user_id where feature_key = 'institutional.plus')
      supabase
        .from('akari_user_feature_grants')
        .select('user_id', { count: 'exact' })
        .eq('feature_key', 'institutional.plus'),
      
      // Recent users (last 10)
      supabase
        .from('akari_users')
        .select('id, display_name, created_at')
        .order('created_at', { ascending: false })
        .limit(10),
      
      // Recent projects (last 10)
      supabase
        .from('projects')
        .select('id, name, slug, x_handle, first_tracked_at')
        .order('first_tracked_at', { ascending: false })
        .limit(10),
    ]);

    // Get unique user IDs for Deep Explorer and Institutional Plus
    const deepExplorerUserIds = new Set(
      (deepExplorerUsersResult.data || []).map((r: any) => r.user_id)
    );
    const institutionalPlusUserIds = new Set(
      (institutionalPlusUsersResult.data || []).map((r: any) => r.user_id)
    );

    // Get X usernames for recent users
    const recentUserIds = (recentUsersResult.data || []).map((u: any) => u.id);
    const { data: xIdentities } = await supabase
      .from('akari_user_identities')
      .select('user_id, username')
      .in('user_id', recentUserIds)
      .eq('provider', 'x');

    const xUsernameMap = new Map((xIdentities || []).map((x: any) => [x.user_id, x.username]));

    // Build stats
    const stats: AdminOverviewStats = {
      totalUsers: totalUsersResult.count || 0,
      trackedProjects: trackedProjectsResult.count || 0,
      deepExplorerUsers: deepExplorerUserIds.size,
      institutionalPlusUsers: institutionalPlusUserIds.size,
    };

    // Map recent users
    const recentUsers: RecentUser[] = (recentUsersResult.data || []).map((u: any) => ({
      id: u.id,
      displayName: u.display_name || null,
      createdAt: u.created_at,
      xUsername: xUsernameMap.get(u.id) || null,
    }));

    // Map recent projects
    const recentProjects: RecentProject[] = (recentProjectsResult.data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      xHandle: p.x_handle || null,
      createdAt: p.first_tracked_at || p.created_at || new Date().toISOString(),
    }));

    return res.status(200).json({
      ok: true,
      stats,
      recentUsers,
      recentProjects,
    });
  } catch (error: any) {
    console.error('[Admin Overview API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

