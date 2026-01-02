/**
 * API Route: POST /api/portal/arc/leaderboard-requests
 * GET /api/portal/arc/leaderboard-requests?projectId=...
 * 
 * POST: Create a new leaderboard request with product type and dates
 * GET: List requests for a project (most recent first)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireProjectRole } from '@/lib/server/require-project-role';
import { requireSuperAdmin } from '@/lib/server/require-superadmin';
import { writeArcAudit, getRequestId } from '@/lib/server/arc-audit';

// =============================================================================
// TYPES
// =============================================================================

interface CreateLeaderboardRequestPayload {
  projectId: string;
  productType: 'ms' | 'gamefi' | 'crm';
  startAt: string; // ISO date string
  endAt: string; // ISO date string
  notes?: string;
}

interface LeaderboardRequest {
  id: string;
  projectId: string;
  productType: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
}

type LeaderboardRequestResponse =
  | { ok: true; request: LeaderboardRequest }
  | { ok: true; requests: LeaderboardRequest[] }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Validate UUID format
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Get profile ID from user ID
 */
async function getProfileIdFromUserId(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<string | null> {
  try {
    const { data: xIdentity, error: identityError } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .single();

    if (identityError || !xIdentity?.username) {
      return null;
    }

    const cleanUsername = xIdentity.username.toLowerCase().replace('@', '').trim();
    
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (profileError || !profile) {
      return null;
    }

    return profile.id;
  } catch (err) {
    return null;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LeaderboardRequestResponse>
) {
  // Handle GET - list requests for a project
  if (req.method === 'GET') {
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    if (!isValidUUID(projectId)) {
      return res.status(400).json({ ok: false, error: 'invalid_project_id' });
    }

    // Check if user is SuperAdmin (bypass project role check)
    const superAdminAuth = await requireSuperAdmin(req);
    const isSuperAdmin = superAdminAuth.ok;

    // If not SuperAdmin, require project team role
    if (!isSuperAdmin) {
      const projectAuth = await requireProjectRole(req, projectId, ['founder', 'admin', 'moderator']);
      if (!projectAuth.ok) {
        return res.status(projectAuth.status).json({ ok: false, error: projectAuth.error });
      }
    }

    try {
      const supabase = getSupabaseAdmin();

      // Fetch requests for this project (most recent first)
      const { data: requests, error: requestsError } = await supabase
        .from('arc_leaderboard_requests')
        .select('id, project_id, product_type, status, start_at, end_at, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (requestsError) {
        // Check if error is due to missing columns
        if (requestsError.message?.includes('column') || requestsError.code === '42703') {
          console.error('[Leaderboard Requests API] Table schema error:', requestsError);
          return res.status(500).json({
            ok: false,
            error: 'Database schema error: arc_leaderboard_requests table is missing required columns (product_type, start_at, end_at). Please run migrations.',
          });
        }

        console.error('[Leaderboard Requests API] Error fetching requests:', requestsError);
        return res.status(500).json({ ok: false, error: 'Failed to fetch requests' });
      }

      const normalizedRequests: LeaderboardRequest[] = (requests || []).map((req: any) => ({
        id: req.id,
        projectId: req.project_id,
        productType: req.product_type || null,
        status: req.status,
        startAt: req.start_at,
        endAt: req.end_at,
      }));

      return res.status(200).json({ ok: true, requests: normalizedRequests });
    } catch (error: any) {
      console.error('[Leaderboard Requests API] Error:', error);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  }

  // Handle POST - create new request
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Parse and validate request body first to get projectId
    const body = req.body as Partial<CreateLeaderboardRequestPayload>;
    const { projectId, productType, startAt, endAt, notes } = body;

    // Validate projectId
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'invalid_project_id' });
    }

    if (!isValidUUID(projectId)) {
      return res.status(400).json({ ok: false, error: 'invalid_project_id' });
    }

    // Check project role before proceeding
    const projectAuth = await requireProjectRole(req, projectId, ['founder', 'admin', 'moderator']);
    if (!projectAuth.ok) {
      return res.status(projectAuth.status).json({ ok: false, error: projectAuth.error });
    }

    const supabase = getSupabaseAdmin();

    // Get profile ID from user ID (for storing requested_by)
    const profileId = await getProfileIdFromUserId(supabase, projectAuth.profileId);
    if (!profileId) {
      return res.status(401).json({
        ok: false,
        error: 'Your Twitter profile is not tracked in the system. Please track your profile first.',
      });
    }

    // Validate productType
    if (!productType || typeof productType !== 'string') {
      return res.status(400).json({ ok: false, error: 'invalid_product_type' });
    }

    if (!['ms', 'gamefi', 'crm'].includes(productType)) {
      return res.status(400).json({ ok: false, error: 'invalid_product_type' });
    }

    // Validate dates for ms and gamefi (required)
    if ((productType === 'ms' || productType === 'gamefi') && (!startAt || !endAt)) {
      return res.status(400).json({ ok: false, error: 'missing_dates' });
    }

    // Validate dates if provided (for crm or ms/gamefi)
    if (startAt && endAt) {
      try {
        const startDate = new Date(startAt);
        const endDate = new Date(endAt);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return res.status(400).json({ ok: false, error: 'invalid_dates' });
        }

        if (startDate >= endDate) {
          return res.status(400).json({ ok: false, error: 'invalid_dates' });
        }
      } catch (dateError) {
        return res.status(400).json({ ok: false, error: 'invalid_dates' });
      }
    }

    // Verify project exists and is ARC-eligible (is_arc_company = true)
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, is_arc_company')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    if (!project.is_arc_company) {
      return res.status(403).json({ 
        ok: false, 
        error: 'Only company/project profiles can submit leaderboard requests' 
      });
    }

    // Insert new request
    // Write notes to both notes (new column) and justification (legacy column) for backwards compatibility
    const insertData: any = {
      project_id: projectId,
      requested_by: profileId,
      status: 'pending',
      product_type: productType,
      start_at: startAt || null,
      end_at: endAt || null,
      notes: notes || null,
      justification: notes || null, // Also write to legacy justification field for backwards compatibility
    };

    const { data: newRequest, error: insertError } = await supabase
      .from('arc_leaderboard_requests')
      .insert(insertData)
      .select('id, project_id, product_type, status, start_at, end_at')
      .single();

    if (insertError) {
      // Check if error is due to missing columns
      if (insertError.message?.includes('column') || insertError.code === '42703') {
        console.error('[Leaderboard Requests API] Table schema error:', insertError);
        return res.status(500).json({
          ok: false,
          error: 'Database schema error: arc_leaderboard_requests table is missing required columns (product_type, start_at, end_at, notes). Please run migrations.',
        });
      }

      // Handle unique constraint violation (pending request already exists)
      if (insertError.code === '23505' || insertError.message?.includes('unique')) {
        // Fetch existing pending request
        const { data: existingRequest } = await supabase
          .from('arc_leaderboard_requests')
          .select('id, project_id, product_type, status, start_at, end_at')
          .eq('project_id', projectId)
          .eq('status', 'pending')
          .maybeSingle();

        if (existingRequest) {
          return res.status(200).json({
            ok: true,
            request: {
              id: existingRequest.id,
              projectId: existingRequest.project_id,
              productType: existingRequest.product_type || productType,
              status: existingRequest.status,
              startAt: existingRequest.start_at,
              endAt: existingRequest.end_at,
            },
          });
        }
      }

      // Log audit for insert error
      const requestId = getRequestId(req);
      await writeArcAudit(supabase, {
        actorProfileId: profileId || null,
        projectId: projectId,
        entityType: 'leaderboard_request',
        entityId: null,
        action: 'request_created',
        success: false,
        message: insertError.message || 'Failed to create request',
        requestId: requestId,
        metadata: { error: insertError.message || 'Database error', body: { projectId, productType, startAt, endAt, notes } },
      });
      console.error('[Leaderboard Requests API] Insert error:', insertError);
      return res.status(500).json({
        ok: false,
        error: insertError.message || 'Failed to create request',
      });
    }

    if (!newRequest || !newRequest.id) {
      const requestId = getRequestId(req);
      await writeArcAudit(supabase, {
        actorProfileId: profileId || null,
        projectId: projectId,
        entityType: 'leaderboard_request',
        entityId: null,
        action: 'request_created',
        success: false,
        message: 'Request created but failed to retrieve request ID',
        requestId: requestId,
        metadata: { body: { projectId, productType, startAt, endAt, notes } },
      });
      return res.status(500).json({ ok: false, error: 'Request created but failed to retrieve request ID' });
    }

    // Log successful request creation
    const requestId = getRequestId(req);
    await writeArcAudit(supabase, {
      actorProfileId: profileId,
      projectId: projectId,
      entityType: 'leaderboard_request',
      entityId: newRequest.id,
      action: 'request_created',
      success: true,
      message: `Leaderboard request created for ${productType}`,
      requestId: requestId,
      metadata: {
        product_type: productType,
        start_at: startAt,
        end_at: endAt,
      },
    });

    return res.status(200).json({
      ok: true,
      request: {
        id: newRequest.id,
        projectId: newRequest.project_id,
        productType: newRequest.product_type || productType,
        status: newRequest.status || 'pending',
        startAt: newRequest.start_at,
        endAt: newRequest.end_at,
      },
    });
  } catch (error: any) {
    console.error('[Leaderboard Requests API] Error:', error);
    const supabase = getSupabaseAdmin();
    const requestId = getRequestId(req);
    const body = req.body as Partial<CreateLeaderboardRequestPayload>;
    // Try to get profile ID, but don't fail if we can't
    let profileId: string | null = null;
    try {
      if (body.projectId) {
        const projectAuth = await requireProjectRole(req, body.projectId, ['founder', 'admin', 'moderator']);
        if (projectAuth.ok) {
          profileId = await getProfileIdFromUserId(supabase, projectAuth.profileId);
        }
      }
    } catch (authError) {
      // Ignore auth errors in catch block
    }
    await writeArcAudit(supabase, {
      actorProfileId: profileId,
      projectId: body.projectId || null,
      entityType: 'leaderboard_request',
      entityId: null,
      action: 'leaderboard_request_created',
      success: false,
      message: error.message || 'Server error',
      requestId: requestId,
      metadata: { error: error.message || 'Unknown error' },
    });
    return res.status(500).json({ ok: false, error: error.message || 'Server error' });
  }
}
