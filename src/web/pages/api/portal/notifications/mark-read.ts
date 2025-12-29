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
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

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

  // Get current user using shared auth helper
  const portalUser = await requirePortalUser(req, res);
  if (!portalUser || !portalUser.profileId) {
    return; // requirePortalUser already sent 401 response
  }

  const body: MarkReadRequest = req.body;

  try {
    let query = supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('profile_id', portalUser.profileId)
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

