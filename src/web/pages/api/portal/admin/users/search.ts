/**
 * API Route: GET /api/portal/admin/users/search
 * 
 * Search for users by display name or X username.
 * Super admin only.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface SearchResult {
  id: string;
  displayName: string | null;
  xUsername: string | null;
  avatarUrl: string | null;
  createdAt: string;
  tier: 'seer' | 'analyst' | 'institutional_plus';
}

type SearchResponse =
  | { ok: true; users: SearchResult[] }
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

/**
 * Determine user tier from feature grants
 */
function computeTierFromGrants(grants: Array<{ feature_key: string; starts_at: string | null; ends_at: string | null }>): 'seer' | 'analyst' | 'institutional_plus' {
  const now = new Date();
  
  for (const grant of grants) {
    // Check if grant is active
    const startsOk = !grant.starts_at || new Date(grant.starts_at) <= now;
    const endsOk = !grant.ends_at || new Date(grant.ends_at) >= now;
    
    if (!startsOk || !endsOk) continue;
    
    // Institutional Plus tier
    if (grant.feature_key === 'deep.explorer' || grant.feature_key === 'institutional.plus') {
      return 'institutional_plus';
    }
  }
  
  for (const grant of grants) {
    const startsOk = !grant.starts_at || new Date(grant.starts_at) <= now;
    const endsOk = !grant.ends_at || new Date(grant.ends_at) >= now;
    
    if (!startsOk || !endsOk) continue;
    
    // Analyst tier
    if (grant.feature_key === 'markets.analytics' || grant.feature_key === 'sentiment.compare' || grant.feature_key === 'sentiment.search') {
      return 'analyst';
    }
  }
  
  return 'seer';
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SearchResponse>
) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Get search query
  const query = req.query.q as string | undefined;
  if (!query || query.trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'Search query must be at least 2 characters' });
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

      const userId = session.user_id;

      // Check if user is super admin
      const isSuperAdmin = await checkSuperAdmin(supabase, userId);
      if (!isSuperAdmin) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
    } else {
      console.log('[Admin User Search API] DEV MODE - skipping auth');
    }

    const searchTerm = query.trim().toLowerCase();
    // Remove @ if present for X username search
    const cleanSearch = searchTerm.startsWith('@') ? searchTerm.slice(1) : searchTerm;

    // Search users by display name (ilike for case-insensitive)
    const { data: usersFromDisplayName, error: displayNameError } = await supabase
      .from('akari_users')
      .select('id, display_name, avatar_url, created_at')
      .ilike('display_name', `%${cleanSearch}%`)
      .limit(20);

    if (displayNameError) {
      console.error('[Admin User Search] Display name search error:', displayNameError);
    }

    // Search users by X username in akari_user_identities
    const { data: xIdentitiesMatch, error: xIdentityError } = await supabase
      .from('akari_user_identities')
      .select('user_id, username')
      .eq('provider', 'x')
      .ilike('username', `%${cleanSearch}%`)
      .limit(20);

    if (xIdentityError) {
      console.error('[Admin User Search] X identity search error:', xIdentityError);
    }

    // Get users from X identity matches
    const xUserIds = (xIdentitiesMatch || []).map((x: any) => x.user_id);
    let usersFromXUsername: any[] = [];
    
    if (xUserIds.length > 0) {
      const { data: xUsers, error: xUsersError } = await supabase
        .from('akari_users')
        .select('id, display_name, avatar_url, created_at')
        .in('id', xUserIds);
      
      if (!xUsersError) {
        usersFromXUsername = xUsers || [];
      }
    }

    // Combine and dedupe users
    const userMap = new Map<string, any>();
    
    for (const u of (usersFromDisplayName || [])) {
      userMap.set(u.id, u);
    }
    for (const u of usersFromXUsername) {
      if (!userMap.has(u.id)) {
        userMap.set(u.id, u);
      }
    }

    const combinedUsers = Array.from(userMap.values());

    if (combinedUsers.length === 0) {
      return res.status(200).json({ ok: true, users: [] });
    }

    // Get X usernames for all users
    const allUserIds = combinedUsers.map((u: any) => u.id);
    const { data: xIdentities } = await supabase
      .from('akari_user_identities')
      .select('user_id, username')
      .in('user_id', allUserIds)
      .eq('provider', 'x');

    const xUsernameMap = new Map((xIdentities || []).map((x: any) => [x.user_id, x.username]));

    // Get feature grants for all users to determine tier
    const { data: featureGrants } = await supabase
      .from('akari_user_feature_grants')
      .select('user_id, feature_key, starts_at, ends_at')
      .in('user_id', allUserIds);

    // Group grants by user
    const grantsByUser = new Map<string, Array<{ feature_key: string; starts_at: string | null; ends_at: string | null }>>();
    for (const grant of (featureGrants || [])) {
      if (!grantsByUser.has(grant.user_id)) {
        grantsByUser.set(grant.user_id, []);
      }
      grantsByUser.get(grant.user_id)!.push({
        feature_key: grant.feature_key,
        starts_at: grant.starts_at,
        ends_at: grant.ends_at,
      });
    }

    // Build search results
    const searchResults: SearchResult[] = combinedUsers.map((u: any) => ({
      id: u.id,
      displayName: u.display_name || null,
      xUsername: xUsernameMap.get(u.id) || null,
      avatarUrl: u.avatar_url || null,
      createdAt: u.created_at,
      tier: computeTierFromGrants(grantsByUser.get(u.id) || []),
    }));

    // Sort by display name
    searchResults.sort((a, b) => {
      const nameA = a.displayName || a.xUsername || '';
      const nameB = b.displayName || b.xUsername || '';
      return nameA.localeCompare(nameB);
    });

    return res.status(200).json({
      ok: true,
      users: searchResults,
    });
  } catch (error: any) {
    console.error('[Admin User Search API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

