/**
 * API Route: GET /api/portal/sentiment/[slug]/audience-geo
 * 
 * Returns the geographic distribution of followers for a project,
 * based on sampled data from twitterapi.io.
 * 
 * =============================================================================
 * ACCESS RESTRICTION
 * =============================================================================
 * 
 * This endpoint is RESTRICTED to Institutional tier users only.
 * - Seer users: 403 Forbidden
 * - Analyst users: 403 Forbidden  
 * - Institutional Plus users: Full access
 * 
 * The check uses FEATURE_KEYS.InstitutionalPlus or FEATURE_KEYS.DeepExplorer
 * (both indicate Institutional tier).
 * 
 * =============================================================================
 * SAFETY
 * =============================================================================
 * 
 * This is a read-only endpoint that:
 * - Does NOT modify any existing sentiment data
 * - Does NOT touch metrics_daily, project_tweets, or inner_circle
 * - Simply returns pre-computed geo data from project_audience_geo table
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createPortalClient, getProjectBySlug } from '@/lib/portal/supabase';
import { can, FEATURE_KEYS } from '@/lib/permissions';

// =============================================================================
// TYPES
// =============================================================================

interface CountryGeo {
  countryCode: string | null;
  countryName: string;
  regionLabel: string | null;
  followerCount: number;
  followerShare: number; // 0-100
}

interface AudienceGeoResponse {
  ok: true;
  projectId: string;
  slug: string;
  computedAt: string | null;
  totalFollowersSampled: number;
  countries: CountryGeo[];
}

interface ErrorResponse {
  ok: false;
  error: string;
  reason?: string;
}

// =============================================================================
// AUTH HELPERS
// =============================================================================

// Get Supabase admin client for auth
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Parse session cookie
function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

// Get user from session
async function getUserFromSession(req: NextApiRequest) {
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return null;
  }

  try {
    const supabase = getSupabaseAdmin();

    // Find session
    const { data: session, error: sessionError } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      return null;
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      return null;
    }

    // Get user info
    const { data: user, error: userError } = await supabase
      .from('akari_users')
      .select('id, display_name, avatar_url, is_active')
      .eq('id', session.user_id)
      .single();

    if (userError || !user || !user.is_active) {
      return null;
    }

    // Get user roles
    const { data: roles } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', user.id);

    // Get feature grants
    const { data: grants } = await supabase
      .from('akari_user_feature_grants')
      .select('id, feature_key, starts_at, ends_at, discount_percent, discount_note')
      .eq('user_id', user.id);

    return {
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      roles: roles?.map(r => r.role) || ['user'],
      featureGrants: (grants || []).map((g: any) => ({
        id: g.id,
        featureKey: g.feature_key,
        startsAt: g.starts_at ? new Date(g.starts_at) : null,
        endsAt: g.ends_at ? new Date(g.ends_at) : null,
        discountPercent: g.discount_percent != null ? Number(g.discount_percent) : 0,
        discountNote: g.discount_note || null,
      })),
    };
  } catch (error) {
    console.error('[AudienceGeo API] Error getting user:', error);
    return null;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AudienceGeoResponse | ErrorResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ ok: false, error: 'Project slug is required' });
  }

  try {
    // ==========================================================================
    // AUTHENTICATION: Require valid Portal session
    // ==========================================================================
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    // ==========================================================================
    // AUTHORIZATION: Require Institutional tier
    // ==========================================================================
    // Build user object compatible with can() helper
    const akariUser = {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      realRoles: user.roles,
      effectiveRoles: user.roles,
      featureGrants: user.featureGrants,
      isLoggedIn: true,
      viewAsRole: null,
      xUsername: null,
      personaType: 'individual' as const,
      personaTag: null,
      telegramConnected: false,
    };

    // Check for Institutional tier access (either InstitutionalPlus or DeepExplorer)
    const hasInstitutional = can(akariUser, FEATURE_KEYS.InstitutionalPlus) || can(akariUser, FEATURE_KEYS.DeepExplorer);
    
    if (!hasInstitutional) {
      console.log(`[AudienceGeo API] Access denied for user ${user.id} - not Institutional tier`);
      return res.status(403).json({ 
        ok: false, 
        error: 'forbidden',
        reason: 'audience_geo_institutional_only',
      });
    }

    // ==========================================================================
    // FETCH DATA (only reached if user is Institutional)
    // ==========================================================================
    const supabase = createPortalClient();

    // Get project by slug
    const project = await getProjectBySlug(supabase, slug);
    if (!project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    // Fetch geo data for this project
    const { data: geoData, error: geoError } = await supabase
      .from('project_audience_geo')
      .select('*')
      .eq('project_id', project.id)
      .order('follower_count', { ascending: false });

    if (geoError) {
      console.error('[AudienceGeo API] Error fetching geo data:', geoError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch geo data' });
    }

    // If no data, return empty result
    if (!geoData || geoData.length === 0) {
      return res.status(200).json({
        ok: true,
        projectId: project.id,
        slug: project.slug,
        computedAt: null,
        totalFollowersSampled: 0,
        countries: [],
      });
    }

    // Get the sample size and computed_at from the first row (all rows share these values)
    const sampleSize = geoData[0]?.sample_size || 0;
    const computedAt = geoData[0]?.computed_at || null;

    // Map to response format
    const countries: CountryGeo[] = geoData.map((row: any) => ({
      countryCode: row.country_code,
      countryName: row.country_name,
      regionLabel: row.region_label,
      followerCount: row.follower_count,
      followerShare: parseFloat(row.follower_share) || 0,
    }));

    return res.status(200).json({
      ok: true,
      projectId: project.id,
      slug: project.slug,
      computedAt,
      totalFollowersSampled: sampleSize,
      countries,
    });
  } catch (error: any) {
    console.error('[AudienceGeo API] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}
