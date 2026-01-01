/**
 * API Route: POST /api/portal/arc/leaderboard-requests
 * GET /api/portal/arc/leaderboard-requests?projectId=...
 * 
 * POST: Create a new leaderboard request with product type and dates
 * GET: List requests for a project (most recent first)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

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
 * Extract session token from request cookies
 */
function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

/**
 * Get user ID from session token
 */
async function getUserIdFromSession(sessionToken: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: session, error } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (error || !session) {
      return null;
    }

    if (new Date(session.expires_at) < new Date()) {
      await supabase.from('akari_user_sessions').delete().eq('session_token', sessionToken);
      return null;
    }

    return session.user_id;
  } catch (err) {
    return null;
  }
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
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const userId = await getUserIdFromSession(sessionToken);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    const { projectId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    if (!isValidUUID(projectId)) {
      return res.status(400).json({ ok: false, error: 'invalid_project_id' });
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

  // Check authentication
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  const userId = await getUserIdFromSession(sessionToken);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Invalid session' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get profile ID
    const profileId = await getProfileIdFromUserId(supabase, userId);
    if (!profileId) {
      return res.status(401).json({
        ok: false,
        error: 'Your Twitter profile is not tracked in the system. Please track your profile first.',
      });
    }

    // Parse and validate request body
    const body = req.body as Partial<CreateLeaderboardRequestPayload>;

    const { projectId, productType, startAt, endAt, notes } = body;

    // Validate projectId
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'invalid_project_id' });
    }

    if (!isValidUUID(projectId)) {
      return res.status(400).json({ ok: false, error: 'invalid_project_id' });
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

    // Verify project exists
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
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

      console.error('[Leaderboard Requests API] Insert error:', insertError);
      return res.status(500).json({
        ok: false,
        error: insertError.message || 'Failed to create request',
      });
    }

    if (!newRequest || !newRequest.id) {
      return res.status(500).json({ ok: false, error: 'Request created but failed to retrieve request ID' });
    }

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
    return res.status(500).json({ ok: false, error: error.message || 'Server error' });
  }
}
