/**
 * API Route: GET /api/portal/admin/arc/reports-list
 * 
 * Get list of available reports for the current user.
 * - Project admins: See reports for their projects only
 * - Super admins: See all reports
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isSuperAdminServerSide } from '@/lib/server-auth';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface ReportItem {
  kind: 'arena' | 'campaign' | 'gamified';
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  projectSlug: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
}

type ReportsListResponse =
  | { ok: true; reports: ReportItem[] }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  const sessionCookie = cookies.find(c => c.startsWith('akari_session='));
  return sessionCookie?.split('=')[1] || null;
}

async function getUserIdFromSession(sessionToken: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: session } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (!session || new Date(session.expires_at) < new Date()) {
      return null;
    }

    return session.user_id;
  } catch (err) {
    return null;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReportsListResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Check authentication
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const userId = await getUserIdFromSession(sessionToken);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    const supabase = getSupabaseAdmin();

    // Check if user is super admin
    const isSuperAdmin = await isSuperAdminServerSide(userId);

    const reports: ReportItem[] = [];

    // Get arenas
    const { data: arenas } = await supabase
      .from('arenas')
      .select('id, name, project_id, status, starts_at, ends_at, projects:project_id(id, name, slug)')
      .order('created_at', { ascending: false });

    // Get campaigns
    const { data: campaigns } = await supabase
      .from('arc_campaigns')
      .select('id, name, project_id, status, starts_at, ends_at, projects:project_id(id, name, slug)')
      .order('created_at', { ascending: false });

    // Get creator manager programs (gamified)
    const { data: programs } = await supabase
      .from('creator_manager_programs')
      .select('id, title, project_id, status, starts_at, ends_at, projects:project_id(id, name, slug)')
      .order('created_at', { ascending: false });

    // Filter by permission if not super admin
    if (!isSuperAdmin) {
      // For each item, check if user can manage the project
      for (const arena of arenas || []) {
        const permissions = await checkProjectPermissions(supabase, userId, arena.project_id);
        if (permissions.canManage) {
          reports.push({
            kind: 'arena',
            id: arena.id,
            title: arena.name || 'Arena',
            projectId: arena.project_id,
            projectName: (arena.projects as any)?.name || 'Unknown Project',
            projectSlug: (arena.projects as any)?.slug || null,
            status: arena.status || 'unknown',
            startsAt: arena.starts_at,
            endsAt: arena.ends_at,
          });
        }
      }

      for (const campaign of campaigns || []) {
        const permissions = await checkProjectPermissions(supabase, userId, campaign.project_id);
        if (permissions.canManage) {
          reports.push({
            kind: 'campaign',
            id: campaign.id,
            title: campaign.name || 'Campaign',
            projectId: campaign.project_id,
            projectName: (campaign.projects as any)?.name || 'Unknown Project',
            projectSlug: (campaign.projects as any)?.slug || null,
            status: campaign.status || 'unknown',
            startsAt: campaign.starts_at,
            endsAt: campaign.ends_at,
          });
        }
      }

      for (const program of programs || []) {
        const permissions = await checkProjectPermissions(supabase, userId, program.project_id);
        if (permissions.canManage) {
          reports.push({
            kind: 'gamified',
            id: program.id,
            title: program.title || 'Program',
            projectId: program.project_id,
            projectName: (program.projects as any)?.name || 'Unknown Project',
            projectSlug: (program.projects as any)?.slug || null,
            status: program.status || 'unknown',
            startsAt: program.starts_at,
            endsAt: program.ends_at,
          });
        }
      }
    } else {
      // Super admin: include all
      for (const arena of arenas || []) {
        reports.push({
          kind: 'arena',
          id: arena.id,
          title: arena.name || 'Arena',
          projectId: arena.project_id,
          projectName: (arena.projects as any)?.name || 'Unknown Project',
          projectSlug: (arena.projects as any)?.slug || null,
          status: arena.status || 'unknown',
          startsAt: arena.starts_at,
          endsAt: arena.ends_at,
        });
      }

      for (const campaign of campaigns || []) {
        reports.push({
          kind: 'campaign',
          id: campaign.id,
          title: campaign.name || 'Campaign',
          projectId: campaign.project_id,
          projectName: (campaign.projects as any)?.name || 'Unknown Project',
          projectSlug: (campaign.projects as any)?.slug || null,
          status: campaign.status || 'unknown',
          startsAt: campaign.starts_at,
          endsAt: campaign.ends_at,
        });
      }

      for (const program of programs || []) {
        reports.push({
          kind: 'gamified',
          id: program.id,
          title: program.title || 'Program',
          projectId: program.project_id,
          projectName: (program.projects as any)?.name || 'Unknown Project',
          projectSlug: (program.projects as any)?.slug || null,
          status: program.status || 'unknown',
          startsAt: program.starts_at,
          endsAt: program.ends_at,
        });
      }
    }

    return res.status(200).json({ ok: true, reports });
  } catch (error: any) {
    console.error('[Reports List API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

