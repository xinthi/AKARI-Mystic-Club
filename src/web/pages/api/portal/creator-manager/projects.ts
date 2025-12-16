/**
 * API Route: /api/portal/creator-manager/projects
 * 
 * GET: List projects where the current user has admin/moderator permissions
 * 
 * Returns projects with their Creator Manager programs.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface Project {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
  twitter_username: string | null;
}

interface Program {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  visibility: 'private' | 'public' | 'hybrid';
  status: 'active' | 'paused' | 'ended';
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  stats?: {
    totalCreators: number;
    approvedCreators: number;
    totalArcPoints: number;
  };
}

interface ProjectWithPrograms extends Project {
  programs: Program[];
}

type ProjectsResponse =
  | { ok: true; projects: ProjectWithPrograms[] }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
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

async function getCurrentUser(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string): Promise<{ userId: string } | null> {
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

  return {
    userId: session.user_id,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProjectsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get current user from session
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const currentUser = await getCurrentUser(supabase, sessionToken);
    if (!currentUser) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired session' });
    }

    // Get all projects
    const { data: projectsData, error: projectsError } = await supabase
      .from('projects')
      .select('id, name, slug, avatar_url, twitter_username')
      .order('name');

    if (projectsError) {
      console.error('[Creator Manager Projects] Error fetching projects:', projectsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch projects' });
    }

    // Filter projects where user has permissions
    const projectsWithAccess: ProjectWithPrograms[] = [];

    for (const project of projectsData || []) {
      const permissions = await checkProjectPermissions(
        supabase,
        currentUser.userId,
        project.id
      );

      if (permissions.canManage) {
        // Get programs for this project
        const { data: programs, error: programsError } = await supabase
          .from('creator_manager_programs')
          .select('*')
          .eq('project_id', project.id)
          .order('created_at', { ascending: false });

        if (programsError) {
          console.error(`[Creator Manager Projects] Error fetching programs for project ${project.id}:`, programsError);
        }

        // Get stats for each program
        const programsWithStats: Program[] = await Promise.all(
          (programs || []).map(async (program) => {
            const { count: totalCreators } = await supabase
              .from('creator_manager_creators')
              .select('*', { count: 'exact', head: true })
              .eq('program_id', program.id);

            const { count: approvedCreators } = await supabase
              .from('creator_manager_creators')
              .select('*', { count: 'exact', head: true })
              .eq('program_id', program.id)
              .eq('status', 'approved');

            const { data: pointsData } = await supabase
              .from('creator_manager_creators')
              .select('arc_points')
              .eq('program_id', program.id);

            const totalArcPoints = (pointsData || []).reduce((sum, c) => sum + (c.arc_points || 0), 0);

            return {
              ...program,
              stats: {
                totalCreators: totalCreators || 0,
                approvedCreators: approvedCreators || 0,
                totalArcPoints,
              },
            };
          })
        );

        projectsWithAccess.push({
          ...project,
          programs: programsWithStats,
        });
      }
    }

    return res.status(200).json({ ok: true, projects: projectsWithAccess });
  } catch (error: any) {
    console.error('[Creator Manager Projects] Error:', error);

    // Check for Supabase configuration errors
    if (error.message?.includes('Missing Supabase') || error.message?.includes('configuration')) {
      return res.status(503).json({
        ok: false,
        error: 'Service configuration error. Please contact support.',
      });
    }

    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch projects',
    });
  }
}

