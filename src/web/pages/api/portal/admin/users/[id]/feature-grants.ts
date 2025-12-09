/**
 * API Route: POST/DELETE /api/portal/admin/users/[id]/feature-grants
 * 
 * Allows super admins to grant or revoke feature access for users.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

type FeatureGrantsResponse =
  | { ok: true }
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
  res: NextApiResponse<FeatureGrantsResponse>
) {
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

    const adminUserId = session.user_id;

    // Check if user is super admin
    const isSuperAdmin = await checkSuperAdmin(supabase, adminUserId);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    // Get user ID from URL
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'User ID is required' });
    }

    const targetUserId = id;

    // Handle POST (upsert grant)
    if (req.method === 'POST') {
      const { featureKey, startsAt, endsAt } = req.body;

      if (!featureKey || (featureKey !== 'deep.explorer' && featureKey !== 'institutional.plus')) {
        return res.status(400).json({ ok: false, error: 'Invalid feature key' });
      }

      // Parse dates (null means "now" for startsAt, "no expiry" for endsAt)
      const startsAtValue = startsAt ? new Date(startsAt).toISOString() : new Date().toISOString();
      const endsAtValue = endsAt ? new Date(endsAt).toISOString() : null;

      // Upsert the grant
      const { error: upsertError } = await supabase
        .from('akari_user_feature_grants')
        .upsert(
          {
            user_id: targetUserId,
            feature_key: featureKey,
            starts_at: startsAtValue,
            ends_at: endsAtValue,
          },
          {
            onConflict: 'user_id,feature_key',
          }
        );

      if (upsertError) {
        console.error('[Admin Feature Grants API] Upsert error:', upsertError);
        return res.status(500).json({ ok: false, error: 'Failed to update feature grant' });
      }

      return res.status(200).json({ ok: true });
    }

    // Handle DELETE (remove grant)
    if (req.method === 'DELETE') {
      // Get featureKey from query string or body
      const featureKey = (req.query.featureKey as string) || req.body?.featureKey;

      if (!featureKey || (featureKey !== 'deep.explorer' && featureKey !== 'institutional.plus')) {
        return res.status(400).json({ ok: false, error: 'Invalid feature key' });
      }

      // Delete the grant
      const { error: deleteError } = await supabase
        .from('akari_user_feature_grants')
        .delete()
        .eq('user_id', targetUserId)
        .eq('feature_key', featureKey);

      if (deleteError) {
        console.error('[Admin Feature Grants API] Delete error:', deleteError);
        return res.status(500).json({ ok: false, error: 'Failed to remove feature grant' });
      }

      return res.status(200).json({ ok: true });
    }

    // Method not allowed
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[Admin Feature Grants API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

