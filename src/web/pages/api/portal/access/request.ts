/**
 * API Route: POST /api/portal/access/request
 * 
 * Allows authenticated users to request access to premium features
 * (deep.explorer, institutional.plus).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { FEATURE_KEYS } from '@/lib/permissions';
import type { FeatureKey } from '@/lib/permissions';

// =============================================================================
// TYPES
// =============================================================================

interface AccessRequestPayload {
  featureKey: FeatureKey | string;
  requestedPlan?: string | null;
  justification?: string | null;
}

type AccessRequestResponse =
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

function isValidFeatureKey(value: unknown): value is FeatureKey {
  if (typeof value !== 'string') return false;
  return value === FEATURE_KEYS.DeepExplorer || value === FEATURE_KEYS.InstitutionalPlus;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AccessRequestResponse>
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

    const userId = session.user_id;

    // Parse and validate request body
    const { featureKey, requestedPlan, justification } = req.body as Partial<AccessRequestPayload>;

    if (!featureKey || !isValidFeatureKey(featureKey)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid featureKey. Must be "${FEATURE_KEYS.DeepExplorer}" or "${FEATURE_KEYS.InstitutionalPlus}".`,
      });
    }

    // Check if user already has a pending request for this feature
    const { data: existingRequest, error: checkError } = await supabase
      .from('akari_access_requests')
      .select('id')
      .eq('user_id', userId)
      .eq('feature_key', featureKey)
      .eq('status', 'pending')
      .maybeSingle();

    if (checkError) {
      console.error('[Access Request API] Check error:', checkError);
      return res.status(500).json({ ok: false, error: 'Failed to check existing requests' });
    }

    if (existingRequest) {
      return res.status(400).json({
        ok: false,
        error: 'You already have a pending request for this feature.',
      });
    }

    // Insert new access request
    const { error: insertError } = await supabase
      .from('akari_access_requests')
      .insert({
        user_id: userId,
        feature_key: featureKey,
        requested_plan: requestedPlan || null,
        justification: justification || null,
        status: 'pending',
        decided_by: null,
        decided_at: null,
      });

    if (insertError) {
      console.error('[Access Request API] Insert error:', insertError);
      return res.status(500).json({ ok: false, error: 'Failed to create access request' });
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('[Access Request API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

