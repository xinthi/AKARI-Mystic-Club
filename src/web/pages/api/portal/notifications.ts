/**
 * API Route: /api/portal/notifications
 * 
 * GET: List notifications for the current user
 * 
 * Permissions: Users can only fetch their own notifications
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

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

  // Get current user using shared auth helper
  const portalUser = await requirePortalUser(req, res);
  if (!portalUser) {
    return; // requirePortalUser already sent 401 response
  }

  try {
    // Get pagination params
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get notifications for current user
    const { data: notifications, error: notificationsError } = await supabase
      .from('notifications')
      .select('*')
      .eq('profile_id', portalUser.profileId)
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
      .eq('profile_id', portalUser.profileId)
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

