/**
 * API Route: POST /api/portal/access/upgrade
 * 
 * Allows authenticated users to request tier upgrades (analyst, institutional_plus).
 * This creates an access request record that admins can review and approve.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { FEATURE_KEYS } from '@/lib/permissions';

// =============================================================================
// TYPES
// =============================================================================

interface UpgradeRequestPayload {
  desiredTier: 'analyst' | 'institutional_plus';
  xHandle?: string | null;
  message?: string | null;
}

type UpgradeRequestResponse =
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

/**
 * Map tier to the primary feature key that represents that tier
 */
function tierToFeatureKey(tier: 'analyst' | 'institutional_plus'): string {
  if (tier === 'institutional_plus') {
    return FEATURE_KEYS.InstitutionalPlus;
  }
  // For analyst tier, use markets.analytics as the representative feature key
  // This is one of the key analyst features and represents the tier well
  return 'markets.analytics';
}

/**
 * Format justification field to include xHandle and message
 */
function formatJustification(xHandle: string | null | undefined, message: string | null | undefined): string {
  const parts: string[] = [];
  
  if (xHandle) {
    // Remove @ if user included it
    const cleanHandle = xHandle.replace(/^@/, '');
    parts.push(`X Handle: @${cleanHandle}`);
  }
  
  if (message && message.trim()) {
    if (parts.length > 0) {
      parts.push(''); // Empty line separator
    }
    parts.push(message.trim());
  }
  
  return parts.join('\n') || 'No additional information provided.';
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpgradeRequestResponse>
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
    const { desiredTier, xHandle, message } = req.body as Partial<UpgradeRequestPayload>;

    if (!desiredTier || (desiredTier !== 'analyst' && desiredTier !== 'institutional_plus')) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid desiredTier. Must be "analyst" or "institutional_plus".',
      });
    }

    // Map tier to feature key
    const featureKey = tierToFeatureKey(desiredTier);

    // Check if user already has a pending request for this tier
    // We check by requested_plan to catch tier-based requests
    const { data: existingRequest, error: checkError } = await supabase
      .from('akari_access_requests')
      .select('id')
      .eq('user_id', userId)
      .eq('requested_plan', desiredTier)
      .eq('status', 'pending')
      .maybeSingle();

    if (checkError) {
      console.error('[Upgrade Request API] Check error:', checkError);
      return res.status(500).json({ ok: false, error: 'Failed to check existing requests' });
    }

    if (existingRequest) {
      return res.status(400).json({
        ok: false,
        error: `You already have a pending upgrade request for ${desiredTier} tier.`,
      });
    }

    // Format justification with xHandle and message
    const justification = formatJustification(xHandle, message);

    // Insert new access request
    const { error: insertError } = await supabase
      .from('akari_access_requests')
      .insert({
        user_id: userId,
        feature_key: featureKey,
        requested_plan: desiredTier,
        justification: justification,
        status: 'pending',
        decided_by: null,
        decided_at: null,
      });

    if (insertError) {
      console.error('[Upgrade Request API] Insert error:', insertError);
      return res.status(500).json({ ok: false, error: 'Failed to create upgrade request' });
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('[Upgrade Request API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

