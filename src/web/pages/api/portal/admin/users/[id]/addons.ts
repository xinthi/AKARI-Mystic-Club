/**
 * API Route: POST /api/portal/admin/users/[id]/addons
 * 
 * Allows super admins to toggle the Deep Analytics addon for users.
 * This addon grants access to Twitter Analytics and CSV export without changing tier.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { FEATURE_KEYS } from '@/lib/permissions';

// =============================================================================
// TYPES
// =============================================================================

interface AddonsRequestPayload {
  deepAnalyticsAddon: boolean;
}

type AddonsResponse =
  | { ok: true; deepAnalyticsAddon: boolean }
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
  res: NextApiResponse<AddonsResponse>
) {
  // Only allow POST
  if (req.method !== 'POST') {
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

    const currentUserId = session.user_id;

    // Check if user is super admin
    const isSuperAdmin = await checkSuperAdmin(supabase, currentUserId);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'Forbidden: Super admin access required' });
    }

    // Get target user ID from URL
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'User ID is required' });
    }

    const targetUserId = id;

    // Verify target user exists
    const { data: targetUser, error: userError } = await supabase
      .from('akari_users')
      .select('id')
      .eq('id', targetUserId)
      .single();

    if (userError || !targetUser) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Parse and validate request body
    const { deepAnalyticsAddon } = req.body as Partial<AddonsRequestPayload>;

    if (typeof deepAnalyticsAddon !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'deepAnalyticsAddon must be a boolean' });
    }

    const now = new Date().toISOString();
    const featureKey = FEATURE_KEYS.DeepAnalyticsAddon;

    if (deepAnalyticsAddon) {
      // Grant the addon: upsert feature grant
      const { data: existingGrant } = await supabase
        .from('akari_user_feature_grants')
        .select('id')
        .eq('user_id', targetUserId)
        .eq('feature_key', featureKey)
        .maybeSingle();

      if (!existingGrant) {
        const { error: grantError } = await supabase
          .from('akari_user_feature_grants')
          .insert({
            user_id: targetUserId,
            feature_key: featureKey,
            starts_at: now,
            ends_at: null, // No expiration
            created_by: currentUserId,
          });

        if (grantError) {
          console.error('[Admin Addons API] Error granting addon:', grantError);
          return res.status(500).json({ ok: false, error: 'Failed to grant addon' });
        }
      }
    } else {
      // Revoke the addon: remove feature grant
      const { error: deleteError } = await supabase
        .from('akari_user_feature_grants')
        .delete()
        .eq('user_id', targetUserId)
        .eq('feature_key', featureKey);

      if (deleteError) {
        console.error('[Admin Addons API] Error revoking addon:', deleteError);
        return res.status(500).json({ ok: false, error: 'Failed to revoke addon' });
      }
    }

    return res.status(200).json({ ok: true, deepAnalyticsAddon });
  } catch (error: any) {
    console.error('[Admin Addons API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

