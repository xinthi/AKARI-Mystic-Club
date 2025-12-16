/**
 * API Route: POST /api/portal/notifications/mark-read
 * 
 * Mark notifications as read
 * 
 * Input: { ids?: string[] } - If not provided, mark all as read
 * 
 * Permissions: Users can only mark their own notifications as read
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface MarkReadRequest {
  ids?: string[];
}

type MarkReadResponse =
  | { ok: true; message: string; marked: number }
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

async function getCurrentUserProfile(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string): Promise<{ profileId: string } | null> {
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

  const { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', session.user_id)
    .eq('provider', 'x')
    .single();

  if (!xIdentity?.username) {
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
    .single();

  if (!profile) {
    return null;
  }

  return {
    profileId: profile.id,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MarkReadResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();

  // Get current user
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  const currentUser = await getCurrentUserProfile(supabase, sessionToken);
  if (!currentUser) {
    return res.status(401).json({ ok: false, error: 'Invalid session' });
  }

  const body: MarkReadRequest = req.body;

  try {
    let query = supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('profile_id', currentUser.profileId)
      .eq('is_read', false);

    // If specific IDs provided, filter by them
    if (body.ids && body.ids.length > 0) {
      query = query.in('id', body.ids);
    }

    const { data, error: updateError } = await query.select('id');

    if (updateError) {
      console.error('[Mark Read] Error updating notifications:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to mark notifications as read' });
    }

    const marked = data?.length || 0;

    return res.status(200).json({
      ok: true,
      message: `Marked ${marked} notification(s) as read`,
      marked,
    });
  } catch (error: any) {
    console.error('[Mark Read] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

