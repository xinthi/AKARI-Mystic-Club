/**
 * API Route: POST /api/portal/creator-circles/accept
 * 
 * Accept a circle connection request
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type AcceptCircleResponse =
  | {
      ok: true;
      circle: {
        id: string;
        status: string;
      };
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AcceptCircleResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { profileId } = await requirePortalUser(req, res);
    const supabase = createPortalClient();

    const { circleId } = req.body;

    if (!circleId || typeof circleId !== 'string') {
      return res.status(400).json({ ok: false, error: 'circleId is required' });
    }

    // Get the circle and verify it's a pending request for current user
    const { data: circle, error: circleError } = await supabase
      .from('creator_circles')
      .select('*')
      .eq('id', circleId)
      .single();

    if (circleError || !circle) {
      return res.status(404).json({ ok: false, error: 'Connection request not found' });
    }

    // Verify current user is the recipient (circle_member_profile_id)
    if (circle.circle_member_profile_id !== profileId) {
      return res.status(403).json({ ok: false, error: 'Not authorized to accept this request' });
    }

    if (circle.status !== 'pending') {
      return res.status(400).json({ ok: false, error: 'Connection request is not pending' });
    }

    // Update status to accepted
    const { data: updatedCircle, error: updateError } = await supabase
      .from('creator_circles')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', circleId)
      .select()
      .single();

    if (updateError) {
      console.error('[Accept Circle API] Error updating circle:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to accept connection request' });
    }

    return res.status(200).json({
      ok: true,
      circle: {
        id: updatedCircle.id,
        status: updatedCircle.status,
      },
    });
  } catch (error: any) {
    console.error('[Accept Circle API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
