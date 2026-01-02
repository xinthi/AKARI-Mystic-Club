/**
 * API Route: GET /api/portal/profiles/search
 * 
 * Search for profiles by username.
 * Used for finding profiles to add as team members.
 * 
 * Access: Any authenticated portal user (for project team management)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

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

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

async function getCurrentUser(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string) {
  const { data: session, error: sessionError } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (sessionError || !session) {
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    return null;
  }

  return { userId: session.user_id };
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

    // Check authentication (any logged-in user can search)
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const currentUser = await getCurrentUser(supabase, sessionToken);
    if (!currentUser) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    // Search profiles by username
    const searchTerm = query.trim().toLowerCase().replace('@', '');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, name, profile_image_url')
      .ilike('username', `%${searchTerm}%`)
      .limit(20);

    if (profilesError) {
      console.error('[Profile Search API] Error searching profiles:', profilesError);
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
    console.error('[Profile Search API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
