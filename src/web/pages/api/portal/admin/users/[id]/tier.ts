/**
 * API Route: POST /api/portal/admin/users/[id]/tier
 * 
 * Allows super admins to manually assign tier-level access (Seer/Analyst/Institutional Plus).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface TierRequestPayload {
  tier: 'seer' | 'analyst' | 'institutional_plus';
}

type TierResponse =
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

/**
 * Get feature keys that should be granted for a tier
 */
function getTierFeatureKeys(tier: 'seer' | 'analyst' | 'institutional_plus'): string[] {
  if (tier === 'seer') {
    // Seer: no special features (base access only)
    return [];
  } else if (tier === 'analyst') {
    // Analyst: core Analyst features
    return ['markets.analytics', 'sentiment.compare', 'sentiment.search'];
  } else {
    // Institutional Plus: Analyst features + Institutional Plus features
    return ['markets.analytics', 'sentiment.compare', 'sentiment.search', 'deep.explorer', 'institutional.plus'];
  }
}

/**
 * Get feature keys that should be removed when downgrading from a tier
 */
function getTierRemovalKeys(tier: 'seer' | 'analyst' | 'institutional_plus'): string[] {
  if (tier === 'seer') {
    // Removing all tier-specific features
    return ['markets.analytics', 'sentiment.compare', 'sentiment.search', 'deep.explorer', 'institutional.plus'];
  } else if (tier === 'analyst') {
    // Removing only Institutional Plus features
    return ['deep.explorer', 'institutional.plus'];
  } else {
    // Institutional Plus: no removals
    return [];
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TierResponse>
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
    const { tier } = req.body as Partial<TierRequestPayload>;

    if (!tier || (tier !== 'seer' && tier !== 'analyst' && tier !== 'institutional_plus')) {
      return res.status(400).json({ ok: false, error: 'tier must be "seer", "analyst", or "institutional_plus"' });
    }

    const now = new Date().toISOString();

    // Get features to grant and remove
    const featuresToGrant = getTierFeatureKeys(tier);
    const featuresToRemove = getTierRemovalKeys(tier);

    // Remove features that should not be present for this tier
    for (const featureKey of featuresToRemove) {
      const { error: deleteError } = await supabase
        .from('akari_user_feature_grants')
        .delete()
        .eq('user_id', targetUserId)
        .eq('feature_key', featureKey);

      if (deleteError) {
        console.error(`[Admin Tier API] Error removing ${featureKey}:`, deleteError);
        // Continue with other operations
      }
    }

    // Grant features for this tier
    for (const featureKey of featuresToGrant) {
      // Check if grant already exists
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
          console.error(`[Admin Tier API] Error granting ${featureKey}:`, grantError);
          // Continue with other features
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('[Admin Tier API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

