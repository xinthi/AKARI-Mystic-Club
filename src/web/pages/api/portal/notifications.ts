/**
 * API Route: /api/portal/notifications
 * 
 * GET: List notifications for the current user
 * 
 * Permissions: Users can only fetch their own notifications
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface Notification {
  id: string;
  profile_id: string;
  type: string;
  context: Record<string, any> | null;
  is_read: boolean;
  created_at: string;
}

type NotificationsResponse =
  | { ok: true; notifications: Notification[]; unreadCount: number }
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
  res: NextApiResponse<NotificationsResponse>
) {
  if (req.method !== 'GET') {
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

  try {
    // Get pagination params
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get notifications for current user
    const { data: notifications, error: notificationsError } = await supabase
      .from('notifications')
      .select('*')
      .eq('profile_id', currentUser.profileId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (notificationsError) {
      console.error('[Notifications] Error fetching notifications:', notificationsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch notifications' });
    }

    // Get unread count
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', currentUser.profileId)
      .eq('is_read', false);

    return res.status(200).json({
      ok: true,
      notifications: notifications || [],
      unreadCount: unreadCount || 0,
    });
  } catch (error: any) {
    console.error('[Notifications] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

