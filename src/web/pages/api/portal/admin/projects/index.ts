/**
 * API Route: GET /api/portal/admin/projects
 * 
 * Returns list of projects with their latest metrics for super admin.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface AdminProjectSummary {
  id: string;
  name: string;
  display_name: string | null;
  slug: string;
  x_handle: string;
  twitter_username: string | null;
  profile_type: 'project' | 'personal' | null;
  is_company: boolean;
  claimed_by: string | null;
  claimed_at: string | null;
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' | null;
  arc_active: boolean;
  arc_active_until: string | null;
  followers: number;
  akari_score: number | null;
  last_updated_at: string | null;
  updated_at: string | null;
  is_active: boolean;
}

type AdminProjectsResponse =
  | {
      ok: true;
      projects: AdminProjectSummary[];
      total: number;
    }
  | { ok: false; error: string };

// =============================================================================
// DEV MODE BYPASS
// =============================================================================

const DEV_MODE = process.env.NODE_ENV === 'development';

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
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminProjectsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get query parameters
    const searchQuery = req.query.q as string | undefined;
    // Support both 'filter' and 'status' for backward compatibility
    const filterParam = (req.query.filter as string | undefined) || (req.query.status as string | undefined);
    const page = parseInt((req.query.page as string) || '1', 10);
    const pageSizeParam = parseInt((req.query.pageSize as string) || (req.query.limit as string) || '50', 10);
    const pageSize = Math.min(Math.max(1, pageSizeParam), 200); // Clamp between 1 and 200

    console.log('[AdminProjectsAPI] Request query params:', {
      q: searchQuery,
      filter: filterParam,
      page,
      pageSize,
    });

    // ==========================================================================
    // DEV MODE: Skip authentication in development
    // ==========================================================================
    if (!DEV_MODE) {
      const sessionToken = getSessionToken(req);
      console.log('[AdminProjectsAPI] Session token exists:', !!sessionToken);
      
      if (!sessionToken) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      // Validate session and get user ID
      const { data: session, error: sessionError } = await supabase
        .from('akari_user_sessions')
        .select('user_id, expires_at')
        .eq('session_token', sessionToken)
        .single();

      if (sessionError || !session) {
        console.log('[AdminProjectsAPI] Invalid session:', sessionError?.message);
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
      console.log('[AdminProjectsAPI] User ID:', userId);

      // Get user's profile to check real_roles
      const { data: xIdentity } = await supabase
        .from('akari_user_identities')
        .select('username')
        .eq('user_id', userId)
        .eq('provider', 'x')
        .single();

      let profileId: string | null = null;
      let realRoles: string[] | null = null;

      if (xIdentity?.username) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, real_roles')
          .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
          .single();
        
        profileId = profile?.id || null;
        realRoles = profile?.real_roles || null;
        console.log('[AdminProjectsAPI] Profile ID:', profileId, 'real_roles:', realRoles);
        
        // Primary check: profiles.real_roles must contain 'super_admin'
        if (!realRoles || !realRoles.includes('super_admin')) {
          console.log('[AdminProjectsAPI] User does not have super_admin in profiles.real_roles');
          // Fall through to checkSuperAdmin which also checks akari_user_roles
        }
      }

      // Check if user is super admin (checks both akari_user_roles and profiles.real_roles)
      const isSuperAdmin = await checkSuperAdmin(supabase, userId);
      console.log('[AdminProjectsAPI] Is SuperAdmin:', isSuperAdmin);
      
      if (!isSuperAdmin) {
        return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
      }
    } else {
      console.log('[AdminProjectsAPI] DEV MODE - skipping auth');
    }

    // Build projects query - first get count for total
    let countQuery = supabase
      .from('projects')
      .select('id', { count: 'exact', head: true });

    // Build main query
    let projectsQuery = supabase
      .from('projects')
      .select('id, name, display_name, slug, x_handle, twitter_username, profile_type, is_company, claimed_by, claimed_at, arc_access_level, arc_active, arc_active_until, is_active, updated_at');

    // Apply filter
    if (filterParam === 'active') {
      projectsQuery = projectsQuery.eq('is_active', true);
      countQuery = countQuery.eq('is_active', true);
    } else if (filterParam === 'hidden') {
      projectsQuery = projectsQuery.eq('is_active', false);
      countQuery = countQuery.eq('is_active', false);
    } else if (filterParam === 'unclassified') {
      // Unclassified: profile_type is null OR profile_type is 'personal'
      projectsQuery = projectsQuery.or('profile_type.is.null,profile_type.eq.personal');
      countQuery = countQuery.or('profile_type.is.null,profile_type.eq.personal');
    } else if (filterParam === 'projects') {
      projectsQuery = projectsQuery.eq('profile_type', 'project');
      countQuery = countQuery.eq('profile_type', 'project');
    } else if (filterParam === 'arc_active') {
      projectsQuery = projectsQuery.eq('arc_active', true);
      countQuery = countQuery.eq('arc_active', true);
    }
    // 'all' or undefined: no filter

    // Apply search filter
    if (searchQuery && searchQuery.trim()) {
      const search = searchQuery.trim();
      // Use ilike with proper escaping for PostgREST
      const searchConditions = [
        `display_name.ilike.%${search}%`,
        `twitter_username.ilike.%${search}%`,
        `slug.ilike.%${search}%`,
        `name.ilike.%${search}%`,
        `x_handle.ilike.%${search}%`,
      ].join(',');
      projectsQuery = projectsQuery.or(searchConditions);
      countQuery = countQuery.or(searchConditions);
    }

    // Get total count
    const { count: total, error: countError } = await countQuery;
    
    if (countError) {
      console.error('[AdminProjectsAPI] Error counting projects:', countError);
      return res.status(500).json({ ok: false, error: 'Failed to count projects' });
    }

    // Apply pagination and ordering
    const offset = (page - 1) * pageSize;
    projectsQuery = projectsQuery
      .order('updated_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + pageSize - 1);

    const { data: projects, error: projectsError } = await projectsQuery;

    if (projectsError) {
      console.error('[AdminProjectsAPI] Error fetching projects:', projectsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch projects' });
    }

    console.log('[AdminProjectsAPI] Query returned', projects?.length || 0, 'projects out of', total || 0, 'total');

    if (!projects || projects.length === 0) {
      return res.status(200).json({ ok: true, projects: [], total: total || 0 });
    }

    const projectIds = projects.map((p) => p.id);

    // Get latest metrics for each project
    const { data: metrics } = await supabase
      .from('metrics_daily')
      .select('project_id, akari_score, followers, updated_at, created_at, date')
      .in('project_id', projectIds)
      .order('date', { ascending: false });

    // Get most recent non-zero followers for fallback
    const { data: followersFallback } = await supabase
      .from('metrics_daily')
      .select('project_id, followers')
      .in('project_id', projectIds)
      .gt('followers', 0)
      .order('date', { ascending: false });

    // Build maps for quick lookup
    const latestMetricsByProject = new Map<string, {
      akari_score: number | null;
      followers: number | null;
      updated_at: string | null;
      created_at: string | null;
      date: string | null;
    }>();

    if (metrics) {
      for (const m of metrics) {
        if (!latestMetricsByProject.has(m.project_id)) {
          latestMetricsByProject.set(m.project_id, {
            akari_score: m.akari_score,
            followers: m.followers,
            updated_at: m.updated_at,
            created_at: m.created_at,
            date: m.date,
          });
        }
      }
    }

    const fallbackFollowersByProject = new Map<string, number>();
    if (followersFallback) {
      for (const row of followersFallback) {
        if (!fallbackFollowersByProject.has(row.project_id)) {
          fallbackFollowersByProject.set(row.project_id, row.followers);
        }
      }
    }

    // Build response
    const projectsWithMetrics: AdminProjectSummary[] = projects.map((project) => {
      const latestMetrics = latestMetricsByProject.get(project.id);
      
      // Compute followers with fallback
      const metricsFollowers = latestMetrics?.followers ?? null;
      const fallbackFollowers = fallbackFollowersByProject.get(project.id) ?? null;
      const followers =
        metricsFollowers && metricsFollowers > 0
          ? metricsFollowers
          : fallbackFollowers && fallbackFollowers > 0
          ? fallbackFollowers
          : 0;

      const lastUpdatedAt = latestMetrics?.updated_at ?? latestMetrics?.created_at ?? latestMetrics?.date ?? null;

      return {
        id: project.id,
        name: project.name,
        display_name: project.display_name || null,
        slug: project.slug,
        x_handle: project.x_handle,
        twitter_username: project.twitter_username || null,
        profile_type: project.profile_type || null,
        is_company: project.is_company || false,
        claimed_by: project.claimed_by || null,
        claimed_at: project.claimed_at || null,
        arc_access_level: project.arc_access_level || null,
        arc_active: project.arc_active || false,
        arc_active_until: project.arc_active_until || null,
        followers,
        akari_score: latestMetrics?.akari_score ?? null,
        last_updated_at: lastUpdatedAt,
        updated_at: project.updated_at || null,
        is_active: project.is_active,
      };
    });

    return res.status(200).json({ ok: true, projects: projectsWithMetrics, total: total || 0 });
  } catch (error: any) {
    console.error('[AdminProjectsAPI] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

