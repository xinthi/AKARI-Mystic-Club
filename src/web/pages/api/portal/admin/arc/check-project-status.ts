/**
 * API Route: GET /api/portal/admin/arc/check-project-status
 * 
 * Diagnostic endpoint to check why a project is not showing in ARC home page
 * Checks: arc_project_access, arc_project_features, arenas, arc_leaderboard_requests
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

// =============================================================================
// TYPES
// =============================================================================

interface ProjectStatus {
  project_id: string;
  project_name: string | null;
  project_slug: string | null;
  twitter_username: string | null;
  is_arc_company: boolean | null;
  is_active: boolean;
  
  // ARC Access
  has_arc_access: boolean;
  arc_access_status: string | null;
  arc_access_created_at: string | null;
  
  // ARC Features
  has_features_row: boolean;
  leaderboard_enabled: boolean | null;
  gamefi_enabled: boolean | null;
  crm_enabled: boolean | null;
  option1_crm_unlocked: boolean | null;
  option2_normal_unlocked: boolean | null;
  option3_gamified_unlocked: boolean | null;
  
  // Arenas
  arenas_count: number;
  active_arenas: Array<{
    id: string;
    name: string;
    status: string;
    kind: string;
    starts_at: string | null;
    ends_at: string | null;
    is_within_date_range: boolean;
  }>;
  
  // Leaderboard Requests
  leaderboard_requests_count: number;
  approved_requests_count: number;
  
  // Eligibility
  is_eligible_for_arc_home: boolean;
  eligibility_reasons: string[];
  blocking_reasons: string[];
}

type ProjectStatusResponse =
  | { ok: true; status: ProjectStatus; message: string }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProjectStatusResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { projectId, projectSlug, twitterUsername } = req.query;

  if (!projectId && !projectSlug && !twitterUsername) {
    return res.status(400).json({ 
      ok: false, 
      error: 'projectId, projectSlug, or twitterUsername is required' 
    });
  }

  try {
    const user = await requirePortalUser(req, res);
    if (!user) {
      return; // requirePortalUser already sent 401 response
    }

    const supabase = getSupabaseAdmin();

    // Find project
    let project: any = null;
    if (projectId && typeof projectId === 'string') {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, slug, twitter_username, is_arc_company, is_active')
        .eq('id', projectId)
        .single();
      
      if (error) {
        console.error('[CheckProjectStatus] Error fetching project:', error);
        return res.status(500).json({ ok: false, error: 'Failed to fetch project' });
      }
      project = data;
    } else if (projectSlug && typeof projectSlug === 'string') {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, slug, twitter_username, is_arc_company, is_active')
        .eq('slug', projectSlug)
        .single();
      
      if (error) {
        console.error('[CheckProjectStatus] Error fetching project:', error);
        return res.status(500).json({ ok: false, error: 'Failed to fetch project' });
      }
      project = data;
    } else if (twitterUsername && typeof twitterUsername === 'string') {
      const normalizedUsername = twitterUsername.toLowerCase().replace(/^@+/, '');
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, slug, twitter_username, is_arc_company, is_active')
        .or(`twitter_username.ilike.${normalizedUsername},x_handle.ilike.${normalizedUsername}`)
        .single();
      
      if (error) {
        console.error('[CheckProjectStatus] Error fetching project:', error);
        return res.status(500).json({ ok: false, error: 'Failed to fetch project' });
      }
      project = data;
    }

    if (!project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    const projectIdValue = project.id;

    // Check ARC Access
    const { data: arcAccess } = await supabase
      .from('arc_project_access')
      .select('application_status, created_at')
      .eq('project_id', projectIdValue)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Check ARC Features
    const { data: arcFeatures } = await supabase
      .from('arc_project_features')
      .select('leaderboard_enabled, gamefi_enabled, crm_enabled, option1_crm_unlocked, option2_normal_unlocked, option3_gamified_unlocked')
      .eq('project_id', projectIdValue)
      .maybeSingle();

    // Check Arenas
    const now = new Date().toISOString();
    const { data: allArenas } = await supabase
      .from('arenas')
      .select('id, name, status, kind, starts_at, ends_at')
      .eq('project_id', projectIdValue);

    const activeArenas = (allArenas || []).filter((arena: any) => {
      const hasStarted = !arena.starts_at || new Date(arena.starts_at) <= new Date(now);
      const hasNotEnded = !arena.ends_at || new Date(arena.ends_at) >= new Date(now);
      const isActiveStatus = arena.status === 'active' || arena.status === 'live';
      const isMSKind = arena.kind === 'ms' || arena.kind === 'legacy_ms';
      return hasStarted && hasNotEnded && isActiveStatus && isMSKind;
    }).map((arena: any) => ({
      id: arena.id,
      name: arena.name,
      status: arena.status,
      kind: arena.kind,
      starts_at: arena.starts_at,
      ends_at: arena.ends_at,
      is_within_date_range: true,
    }));

    // Check Leaderboard Requests
    const { data: leaderboardRequests } = await supabase
      .from('arc_leaderboard_requests')
      .select('status')
      .eq('project_id', projectIdValue);

    const approvedRequests = (leaderboardRequests || []).filter((r: any) => r.status === 'approved');

    // Determine eligibility
    const eligibilityReasons: string[] = [];
    const blockingReasons: string[] = [];

    // Base requirement: Approved ARC access
    const hasApprovedAccess = arcAccess?.application_status === 'approved';
    if (!hasApprovedAccess) {
      blockingReasons.push(`ARC access is not approved (status: ${arcAccess?.application_status || 'missing'})`);
    } else {
      eligibilityReasons.push('ARC access is approved');
    }

    // Check if meets at least one condition
    const hasLeaderboardEnabled = arcFeatures?.leaderboard_enabled === true;
    const hasActiveArena = activeArenas.length > 0;
    const hasApprovedRequest = approvedRequests.length > 0;

    if (hasLeaderboardEnabled) {
      eligibilityReasons.push('leaderboard_enabled = true in arc_project_features');
    }
    if (hasActiveArena) {
      eligibilityReasons.push(`Has ${activeArenas.length} active MS arena(s) within date range`);
    }
    if (hasApprovedRequest) {
      eligibilityReasons.push(`Has ${approvedRequests.length} approved leaderboard request(s)`);
    }

    const meetsAtLeastOneCondition = hasLeaderboardEnabled || hasActiveArena || hasApprovedRequest;

    if (!meetsAtLeastOneCondition && hasApprovedAccess) {
      blockingReasons.push('No active MS arena, no leaderboard_enabled flag, and no approved leaderboard request');
    }

    // Check is_arc_company requirement (from API line 211)
    if (project.is_arc_company !== true && project.is_arc_company !== null) {
      blockingReasons.push(`is_arc_company is ${project.is_arc_company} (must be true or NULL)`);
    }

    if (!project.is_active) {
      blockingReasons.push('Project is not active (is_active = false)');
    }

    const isEligible = hasApprovedAccess && meetsAtLeastOneCondition && 
                       (project.is_arc_company === true || project.is_arc_company === null) &&
                       project.is_active;

    const status: ProjectStatus = {
      project_id: projectIdValue,
      project_name: project.name,
      project_slug: project.slug,
      twitter_username: project.twitter_username,
      is_arc_company: project.is_arc_company,
      is_active: project.is_active,
      
      has_arc_access: !!arcAccess,
      arc_access_status: arcAccess?.application_status || null,
      arc_access_created_at: arcAccess?.created_at || null,
      
      has_features_row: !!arcFeatures,
      leaderboard_enabled: arcFeatures?.leaderboard_enabled || null,
      gamefi_enabled: arcFeatures?.gamefi_enabled || null,
      crm_enabled: arcFeatures?.crm_enabled || null,
      option1_crm_unlocked: arcFeatures?.option1_crm_unlocked || null,
      option2_normal_unlocked: arcFeatures?.option2_normal_unlocked || null,
      option3_gamified_unlocked: arcFeatures?.option3_gamified_unlocked || null,
      
      arenas_count: allArenas?.length || 0,
      active_arenas: activeArenas,
      
      leaderboard_requests_count: leaderboardRequests?.length || 0,
      approved_requests_count: approvedRequests.length,
      
      is_eligible_for_arc_home: isEligible,
      eligibility_reasons,
      blocking_reasons: blockingReasons,
    };

    const message = isEligible
      ? `✅ Project is eligible for ARC home page`
      : `❌ Project is NOT eligible: ${blockingReasons.join('; ')}`;

    return res.status(200).json({ ok: true, status, message });
  } catch (error: any) {
    console.error('[CheckProjectStatus] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}
