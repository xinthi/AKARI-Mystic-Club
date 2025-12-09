/**
 * API Route: GET /api/portal/admin/access/requests
 * 
 * Returns all pending access requests for super admins to review.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface AccessRequestWithUser {
  id: string;
  userId: string;
  featureKey: string;
  requestedPlan: string | null;
  justification: string | null;
  status: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    displayName: string;
    xUsername: string | null;
  };
}

type AccessRequestsResponse =
  | { ok: true; requests: AccessRequestWithUser[] }
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
  res: NextApiResponse<AccessRequestsResponse>
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

    // Query pending requests
    const { data: requests, error: queryError } = await supabase
      .from('akari_access_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (queryError) {
      console.error('[Admin Access Requests API] Query error:', queryError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch requests' });
    }

    if (!requests || requests.length === 0) {
      return res.status(200).json({ ok: true, requests: [] });
    }

    // Get unique user IDs
    const userIds = [...new Set(requests.map((r: any) => r.user_id))];

    // Fetch user display names
    const { data: users } = await supabase
      .from('akari_users')
      .select('id, display_name')
      .in('id', userIds);

    // Fetch X usernames
    const { data: xIdentities } = await supabase
      .from('akari_user_identities')
      .select('user_id, username')
      .in('user_id', userIds)
      .eq('provider', 'x');

    // Create lookup maps
    const userMap = new Map((users || []).map((u: any) => [u.id, u]));
    const xUsernameMap = new Map((xIdentities || []).map((x: any) => [x.user_id, x.username]));

    // Map DB rows to response format
    const mappedRequests: AccessRequestWithUser[] = requests.map((r: any) => {
      const user = userMap.get(r.user_id);
      const xUsername = xUsernameMap.get(r.user_id) || null;

      return {
        id: r.id,
        userId: r.user_id,
        featureKey: r.feature_key,
        requestedPlan: r.requested_plan,
        justification: r.justification,
        status: r.status,
        decidedBy: r.decided_by,
        decidedAt: r.decided_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        user: {
          displayName: user?.display_name || 'Unknown',
          xUsername,
        },
      };
    });

    return res.status(200).json({ ok: true, requests: mappedRequests });
  } catch (error: any) {
    console.error('[Admin Access Requests API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

