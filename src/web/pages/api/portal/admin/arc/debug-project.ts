/**
 * API Route: /api/portal/admin/arc/debug-project
 * 
 * Diagnostic endpoint to check why a project's leaderboard isn't appearing
 * 
 * GET /api/portal/admin/arc/debug-project?projectId=xxx
 * or
 * GET /api/portal/admin/arc/debug-project?projectSlug=uniswap
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { isSuperAdminServerSide } from '@/lib/server-auth';

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
}

type DebugResponse =
  | {
      ok: true;
      project: {
        id: string;
        name: string;
        slug: string | null;
        twitter_username: string | null;
        arc_active: boolean | null;
        arc_access_level: string | null;
      };
      arcProjectAccess: {
        id: string;
        application_status: string;
        created_at: string;
        approved_at: string | null;
      } | null;
      arcProjectFeatures: {
        option1_crm_unlocked: boolean;
        option2_normal_unlocked: boolean;
        option3_gamified_unlocked: boolean;
      } | null;
      arenas: Array<{
        id: string;
        name: string;
        slug: string;
        status: string;
        starts_at: string | null;
        ends_at: string | null;
        project_id: string;
      }>;
      accessCheck: {
        ok: boolean;
        approved: boolean | undefined;
        optionUnlocked: boolean | undefined;
        error: string | undefined;
        code: string | undefined;
      };
      diagnostics: {
        hasArena: boolean;
        arenaStatus: string | null;
        hasApproval: boolean;
        approvalStatus: string | null;
        hasFeatures: boolean;
        option2Unlocked: boolean;
        accessCheckPassed: boolean;
        issues: string[];
      };
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DebugResponse>
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

    // Check super admin
    const isSuperAdmin = await isSuperAdminServerSide(userId);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
    }

    const { projectId, projectSlug } = req.query;

    if (!projectId && !projectSlug) {
      return res.status(400).json({ ok: false, error: 'projectId or projectSlug is required' });
    }

    const supabase = getSupabaseAdmin();

    // Find project
    let projectQuery = supabase.from('projects').select('id, name, slug, twitter_username, arc_active, arc_access_level');
    
    if (projectId) {
      projectQuery = projectQuery.eq('id', projectId as string);
    } else {
      projectQuery = projectQuery.eq('slug', projectSlug as string);
    }

    const { data: project, error: projectError } = await projectQuery.single();

    if (projectError || !project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    // Get arc_project_access (latest)
    const { data: accessData } = await supabase
      .from('arc_project_access')
      .select('id, application_status, created_at, approved_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get arc_project_features
    const { data: featuresData } = await supabase
      .from('arc_project_features')
      .select('option1_crm_unlocked, option2_normal_unlocked, option3_gamified_unlocked')
      .eq('project_id', project.id)
      .maybeSingle();

    // Get arenas
    const { data: arenasData } = await supabase
      .from('arenas')
      .select('id, name, slug, status, starts_at, ends_at, project_id')
      .eq('project_id', project.id)
      .in('status', ['active', 'scheduled', 'paused'])
      .order('created_at', { ascending: false });

    // Run access check
    const accessCheck = await requireArcAccess(supabase, project.id, 2);

    // Diagnose issues
    const issues: string[] = [];
    
    if (!accessData || accessData.application_status !== 'approved') {
      issues.push(`ARC access not approved. Status: ${accessData?.application_status || 'no record'}`);
    }

    if (!featuresData || !featuresData.option2_normal_unlocked) {
      issues.push(`Option 2 (normal leaderboard) not unlocked. option2_normal_unlocked: ${featuresData?.option2_normal_unlocked || false}`);
    }

    if (!arenasData || arenasData.length === 0) {
      issues.push('No active/scheduled/paused arenas found for this project');
    } else {
      const activeArenas = arenasData.filter(a => a.status === 'active');
      if (activeArenas.length === 0) {
        issues.push(`Found ${arenasData.length} arena(s) but none are active. Statuses: ${arenasData.map(a => a.status).join(', ')}`);
      }
    }

    if (!accessCheck.ok) {
      issues.push(`Access check failed: ${accessCheck.error} (code: ${accessCheck.code})`);
    }

    const diagnostics = {
      hasArena: (arenasData?.length || 0) > 0,
      arenaStatus: arenasData?.[0]?.status || null,
      hasApproval: !!accessData,
      approvalStatus: accessData?.application_status || null,
      hasFeatures: !!featuresData,
      option2Unlocked: featuresData?.option2_normal_unlocked || false,
      accessCheckPassed: accessCheck.ok,
      issues,
    };

    return res.status(200).json({
      ok: true,
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        twitter_username: project.twitter_username,
        arc_active: project.arc_active,
        arc_access_level: project.arc_access_level,
      },
      arcProjectAccess: accessData ? {
        id: accessData.id,
        application_status: accessData.application_status,
        created_at: accessData.created_at,
        approved_at: accessData.approved_at,
      } : null,
      arcProjectFeatures: featuresData ? {
        option1_crm_unlocked: featuresData.option1_crm_unlocked,
        option2_normal_unlocked: featuresData.option2_normal_unlocked,
        option3_gamified_unlocked: featuresData.option3_gamified_unlocked,
      } : null,
      arenas: (arenasData || []).map(a => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
        status: a.status,
        starts_at: a.starts_at,
        ends_at: a.ends_at,
        project_id: a.project_id,
      })),
      accessCheck: {
        ok: accessCheck.ok,
        approved: accessCheck.ok ? accessCheck.approved : undefined,
        optionUnlocked: accessCheck.ok ? accessCheck.optionUnlocked : undefined,
        error: accessCheck.ok ? undefined : accessCheck.error,
        code: accessCheck.ok ? undefined : accessCheck.code,
      },
      diagnostics,
    });
  } catch (error: any) {
    console.error('[Debug Project API] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to debug project',
    });
  }
}

