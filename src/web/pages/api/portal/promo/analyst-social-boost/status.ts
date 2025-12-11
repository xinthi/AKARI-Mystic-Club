/**
 * API Route: GET /api/portal/promo/analyst-social-boost/status
 * 
 * Returns the promo state for the logged-in user and whether to show the modal.
 * Only shows promo to Seer users without Deep Analytics addon or higher tiers.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getUserTier } from '@/lib/userTier';
import { can, FEATURE_KEYS, type AkariUser, type FeatureGrant } from '@/lib/permissions';

// =============================================================================
// DEV MODE CHECK
// =============================================================================

const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development';
const DEV_MOCK_USER_ID = 'dev-mock-user';

// =============================================================================
// TYPES
// =============================================================================

type PromoStatusResponse =
  | {
      ok: true;
      showPromo: boolean;
      status: string;
      timesDeclined: number;
      nextShowAt: string | null;
      reason?: string;
    }
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

async function getUserFromSession(req: NextApiRequest, supabase: ReturnType<typeof getSupabaseAdmin>) {
  const sessionToken = getSessionToken(req);
  if (!sessionToken) return null;

  // Validate session
  const { data: session, error: sessionError } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (sessionError || !session) return null;

  // Check if session is expired
  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    return null;
  }

  // Get user data
  const { data: userData } = await supabase
    .from('akari_users')
    .select('id, display_name, avatar_url')
    .eq('id', session.user_id)
    .single();

  if (!userData) return null;

  // Get user roles
  const { data: roles } = await supabase
    .from('akari_user_roles')
    .select('role')
    .eq('user_id', session.user_id);

  // Get feature grants
  const { data: grants } = await supabase
    .from('akari_user_feature_grants')
    .select('id, feature_key, starts_at, ends_at, discount_percent, discount_note')
    .eq('user_id', session.user_id);

  const userRoles = (roles || []).map((r: any) => r.role);
  if (userRoles.length === 0) userRoles.push('user');

  const featureGrants: FeatureGrant[] = (grants || []).map((g: any) => ({
    id: g.id,
    featureKey: g.feature_key,
    startsAt: g.starts_at ? new Date(g.starts_at) : null,
    endsAt: g.ends_at ? new Date(g.ends_at) : null,
    discountPercent: g.discount_percent ?? 0,
    discountNote: g.discount_note ?? null,
  }));

  const user: AkariUser = {
    id: userData.id,
    displayName: userData.display_name || 'User',
    avatarUrl: userData.avatar_url,
    realRoles: userRoles,
    effectiveRoles: userRoles,
    featureGrants,
    isLoggedIn: true,
    viewAsRole: null,
    xUsername: null,
    personaType: 'individual',
    personaTag: null,
    telegramConnected: false,
  };

  return user;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PromoStatusResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // In dev mode without session, return mock promo data for testing
    const hasSessionCookie = req.headers.cookie?.includes('akari_session=');
    if (DEV_BYPASS_AUTH && !hasSessionCookie) {
      console.log('[Promo Status API] Dev mode: using mock promo data');
      return res.status(200).json({
        ok: true,
        showPromo: true,
        status: 'never_seen',
        timesDeclined: 0,
        nextShowAt: null,
      });
    }

    const supabase = getSupabaseAdmin();
    let user = await getUserFromSession(req, supabase);

    if (!user) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const now = new Date();
    const tier = getUserTier(user);

    // Check eligibility: must be Seer without Deep Analytics addon
    const hasDeepAnalytics = can(user, FEATURE_KEYS.DeepAnalyticsAddon, now);
    
    if (tier !== 'seer' || hasDeepAnalytics) {
      return res.status(200).json({
        ok: true,
        showPromo: false,
        status: 'not_eligible',
        timesDeclined: 0,
        nextShowAt: null,
        reason: 'already_has_access',
      });
    }

    // Load or create promo record
    let { data: promo, error: promoError } = await supabase
      .from('analyst_social_boost_promo')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (promoError && promoError.code === 'PGRST116') {
      // No record found, create one
      const { data: newPromo, error: insertError } = await supabase
        .from('analyst_social_boost_promo')
        .insert({
          user_id: user.id,
          status: 'never_seen',
          times_declined: 0,
        })
        .select()
        .single();

      if (insertError) {
        console.error('[Promo Status API] Insert error:', insertError);
        return res.status(500).json({ ok: false, error: 'Failed to create promo record' });
      }

      promo = newPromo;
    } else if (promoError) {
      console.error('[Promo Status API] Query error:', promoError);
      return res.status(500).json({ ok: false, error: 'Failed to load promo state' });
    }

    // Determine if we should show the promo
    let showPromo = false;
    const status = promo.status;
    const nextShowAt = promo.next_show_at ? new Date(promo.next_show_at) : null;

    if (status === 'declined_long_term' || status === 'completed') {
      showPromo = false;
    } else if (nextShowAt === null || nextShowAt <= now) {
      showPromo = true;
    }

    return res.status(200).json({
      ok: true,
      showPromo,
      status: promo.status,
      timesDeclined: promo.times_declined,
      nextShowAt: promo.next_show_at,
    });
  } catch (error: any) {
    console.error('[Promo Status API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

