/**
 * API Route: POST /api/portal/admin/access/decide
 * 
 * Allows super admins to approve or reject access requests.
 * On approve, automatically grants the feature via akari_user_feature_grants.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface DecideRequestPayload {
  requestId: string;
  action: 'approve' | 'reject';
}

type DecideResponse =
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
  res: NextApiResponse<DecideResponse>
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
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    // Parse and validate request body
    const { requestId, action } = req.body as Partial<DecideRequestPayload>;

    if (!requestId || typeof requestId !== 'string') {
      return res.status(400).json({ ok: false, error: 'requestId is required' });
    }

    if (!action || (action !== 'approve' && action !== 'reject')) {
      return res.status(400).json({ ok: false, error: 'action must be "approve" or "reject"' });
    }

    // Load the request
    const { data: request, error: requestError } = await supabase
      .from('akari_access_requests')
      .select('id, user_id, feature_key, requested_plan, status')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      return res.status(404).json({ ok: false, error: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        ok: false,
        error: `Request is not pending (current status: ${request.status})`,
      });
    }

    const now = new Date().toISOString();

    if (action === 'approve') {
      // Update request status
      const { error: updateError } = await supabase
        .from('akari_access_requests')
        .update({
          status: 'approved',
          decided_by: currentUserId,
          decided_at: now,
        })
        .eq('id', requestId);

      if (updateError) {
        console.error('[Admin Access Decide API] Update error:', updateError);
        return res.status(500).json({ ok: false, error: 'Failed to update request' });
      }

      // Determine which features to grant based on requested_plan
      const featuresToGrant: string[] = [];
      
      if (request.requested_plan === 'analyst') {
        // Analyst tier: grant core Analyst features
        featuresToGrant.push('markets.analytics', 'sentiment.compare', 'sentiment.search');
      } else if (request.requested_plan === 'institutional_plus') {
        // Institutional Plus: grant all Analyst features + Institutional Plus features
        featuresToGrant.push('markets.analytics', 'sentiment.compare', 'sentiment.search');
        featuresToGrant.push('deep.explorer', 'institutional.plus');
      } else {
        // Fallback: grant the feature_key from the request (for non-tier requests)
        featuresToGrant.push(request.feature_key);
      }

      // Grant all required features
      for (const featureKey of featuresToGrant) {
        // Check if grant already exists
        const { data: existingGrant } = await supabase
          .from('akari_user_feature_grants')
          .select('id')
          .eq('user_id', request.user_id)
          .eq('feature_key', featureKey)
          .maybeSingle();

        if (!existingGrant) {
          const { error: grantError } = await supabase
            .from('akari_user_feature_grants')
            .insert({
              user_id: request.user_id,
              feature_key: featureKey,
              starts_at: now,
              ends_at: null, // No expiration
              created_by: currentUserId,
            });

          if (grantError) {
            console.error(`[Admin Access Decide API] Grant insert error for ${featureKey}:`, grantError);
            // Continue with other features even if one fails
          }
        }
      }
    } else {
      // action === 'reject'
      const { error: updateError } = await supabase
        .from('akari_access_requests')
        .update({
          status: 'rejected',
          decided_by: currentUserId,
          decided_at: now,
        })
        .eq('id', requestId);

      if (updateError) {
        console.error('[Admin Access Decide API] Update error:', updateError);
        return res.status(500).json({ ok: false, error: 'Failed to update request' });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('[Admin Access Decide API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

