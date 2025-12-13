/**
 * API Route: GET /api/portal/admin/users/[id]
 * 
 * Returns detailed information about a specific user for super admin.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface UserDetail {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  xUsername: string | null;
  xUserId: string | null;
  roles: string[];
}

interface FeatureGrant {
  id: string;
  featureKey: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  discountPercent: number;
  discountNote: string | null;
}

interface AccessRequest {
  id: string;
  featureKey: string;
  requestedPlan: string | null;
  justification: string | null;
  status: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

type UserDetailResponse =
  | {
      ok: true;
      user: UserDetail;
      featureGrants: FeatureGrant[];
      accessRequests: AccessRequest[];
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
  res: NextApiResponse<UserDetailResponse>
) {
  // Only allow GET
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

      const adminUserId = session.user_id;

      // Check if user is super admin
      const isSuperAdmin = await checkSuperAdmin(supabase, adminUserId);
      if (!isSuperAdmin) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
    } else {
      console.log('[Admin User Detail API] DEV MODE - skipping auth');
    }

    // Get user ID from URL
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'User ID is required' });
    }

    const targetUserId = id;

    // Fetch all data in parallel
    const [
      userResult,
      xIdentityResult,
      rolesResult,
      grantsResult,
      requestsResult,
    ] = await Promise.all([
      // User base info
      supabase
        .from('akari_users')
        .select('id, display_name, avatar_url, created_at')
        .eq('id', targetUserId)
        .single(),

      // X identity
      supabase
        .from('akari_user_identities')
        .select('username, provider_user_id')
        .eq('user_id', targetUserId)
        .eq('provider', 'x')
        .maybeSingle(),

      // Roles
      supabase
        .from('akari_user_roles')
        .select('role')
        .eq('user_id', targetUserId),

      // Feature grants
      supabase
        .from('akari_user_feature_grants')
        .select('id, feature_key, starts_at, ends_at, created_at, discount_percent, discount_note')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false }),

      // Access requests (last 10)
      supabase
        .from('akari_access_requests')
        .select('id, feature_key, requested_plan, justification, status, decided_by, decided_at, created_at')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    // Check if user exists
    if (userResult.error || !userResult.data) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const user = userResult.data;
    const xIdentity = xIdentityResult.data;
    const roles = (rolesResult.data || []).map((r: any) => r.role);
    const grants = (grantsResult.data || []).map((g: any) => ({
      id: g.id,
      featureKey: g.feature_key,
      startsAt: g.starts_at,
      endsAt: g.ends_at,
      createdAt: g.created_at,
      discountPercent: g.discount_percent != null ? Number(g.discount_percent) : 0,
      discountNote: g.discount_note || null,
    }));
    const requests = (requestsResult.data || []).map((r: any) => ({
      id: r.id,
      featureKey: r.feature_key,
      requestedPlan: r.requested_plan,
      justification: r.justification,
      status: r.status,
      decidedBy: r.decided_by,
      decidedAt: r.decided_at,
      createdAt: r.created_at,
    }));

    return res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
        xUsername: xIdentity?.username || null,
        xUserId: xIdentity?.provider_user_id || null,
        roles,
      },
      featureGrants: grants,
      accessRequests: requests,
    });
  } catch (error: any) {
    console.error('[Admin User Detail API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

