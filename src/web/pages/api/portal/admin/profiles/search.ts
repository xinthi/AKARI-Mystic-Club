/**
 * API Route: GET /api/portal/admin/profiles/search
 * 
 * Search for profiles by username (SuperAdmin only).
 * Used for finding profiles to add as team members.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface ProfileSearchResult {
  id: string;
  username: string;
  name: string | null;
  profile_image_url: string | null;
}

type SearchResponse =
  | { ok: true; profiles: ProfileSearchResult[] }
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
  try {
    const { data: userRoles } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin');

    if (userRoles && userRoles.length > 0) {
      return true;
    }

    const { data: xIdentity } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .single();

    if (xIdentity?.username) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('real_roles')
        .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
        .single();

      if (profile?.real_roles?.includes('super_admin')) {
        return true;
      }
    }

    return false;
  } catch (err: any) {
    console.error('[Admin Profile Search API] Error in checkSuperAdmin:', err);
    return false;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SearchResponse>
) {
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

    // Check authentication and SuperAdmin
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const { data: session } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (!session || new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    const isSuperAdmin = await checkSuperAdmin(supabase, session.user_id);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
    }

    // Search profiles by username
    const searchTerm = query.trim().toLowerCase().replace('@', '');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, name, profile_image_url')
      .ilike('username', `%${searchTerm}%`)
      .limit(20)
      .order('username', { ascending: true });

    if (profilesError) {
      console.error('[Admin Profile Search API] Error searching profiles:', profilesError);
      return res.status(500).json({ ok: false, error: 'Failed to search profiles' });
    }

    return res.status(200).json({
      ok: true,
      profiles: (profiles || []).map((p: any) => ({
        id: p.id,
        username: p.username,
        name: p.name,
        profile_image_url: p.profile_image_url,
      })),
    });
  } catch (error: any) {
    console.error('[Admin Profile Search API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

