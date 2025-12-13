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
  slug: string;
  x_handle: string;
  followers: number;
  akari_score: number | null;
  last_updated_at: string | null;
  is_active: boolean;
}

type AdminProjectsResponse =
  | {
      ok: true;
      projects: AdminProjectSummary[];
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
  res: NextApiResponse<AdminProjectsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // ==========================================================================
    // DEV MODE: Skip authentication in development
    // ==========================================================================
    if (!DEV_MODE) {
      const sessionToken = getSessionToken(req);
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
    } else {
      console.log('[Admin Projects API] DEV MODE - skipping auth');
    }

    // Get query parameters
    const searchQuery = req.query.q as string | undefined;
    const statusFilter = req.query.status as string | undefined;

    // Build projects query
    let projectsQuery = supabase
      .from('projects')
      .select('id, name, slug, x_handle, is_active')
      .order('name', { ascending: true });

    // Apply status filter
    if (statusFilter === 'active') {
      projectsQuery = projectsQuery.eq('is_active', true);
    } else if (statusFilter === 'hidden') {
      projectsQuery = projectsQuery.eq('is_active', false);
    }
    // 'all' or undefined: no filter

    // Apply search filter
    if (searchQuery && searchQuery.trim()) {
      const search = searchQuery.trim().toLowerCase();
      projectsQuery = projectsQuery.or(
        `name.ilike.%${search}%,slug.ilike.%${search}%,x_handle.ilike.%${search}%`
      );
    }

    const { data: projects, error: projectsError } = await projectsQuery;

    if (projectsError) {
      console.error('[Admin Projects API] Error fetching projects:', projectsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch projects' });
    }

    if (!projects || projects.length === 0) {
      return res.status(200).json({ ok: true, projects: [] });
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
        slug: project.slug,
        x_handle: project.x_handle,
        followers,
        akari_score: latestMetrics?.akari_score ?? null,
        last_updated_at: lastUpdatedAt,
        is_active: project.is_active,
      };
    });

    return res.status(200).json({ ok: true, projects: projectsWithMetrics });
  } catch (error: any) {
    console.error('[Admin Projects API] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

