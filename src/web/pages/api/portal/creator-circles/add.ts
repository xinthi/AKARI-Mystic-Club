/**
 * API Route: POST /api/portal/creator-circles/add
 * 
 * Add a creator to your circle (send a connection request)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type AddCircleResponse =
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
  res: NextApiResponse<AddCircleResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { profileId } = await requirePortalUser(req, res);
    const supabase = createPortalClient();

    const { creatorProfileId } = req.body;

    if (!creatorProfileId || typeof creatorProfileId !== 'string') {
      return res.status(400).json({ ok: false, error: 'creatorProfileId is required' });
    }

    // Cannot add yourself
    if (creatorProfileId === profileId) {
      return res.status(400).json({ ok: false, error: 'Cannot add yourself to your circle' });
    }

    // Check if creator exists
    const { data: creatorProfile, error: creatorError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', creatorProfileId)
      .single();

    if (creatorError || !creatorProfile) {
      return res.status(404).json({ ok: false, error: 'Creator not found' });
    }

    // Check if connection already exists
    const { data: existingCircle, error: checkError } = await supabase
      .from('creator_circles')
      .select('*')
      .or(`and(creator_profile_id.eq.${profileId},circle_member_profile_id.eq.${creatorProfileId}),and(creator_profile_id.eq.${creatorProfileId},circle_member_profile_id.eq.${profileId})`)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 = not found, which is fine
      console.error('[Add Circle API] Error checking existing circle:', checkError);
      return res.status(500).json({ ok: false, error: 'Failed to check existing connection' });
    }

    if (existingCircle) {
      if (existingCircle.status === 'accepted') {
        return res.status(400).json({ ok: false, error: 'Already connected' });
      }
      if (existingCircle.status === 'pending') {
        return res.status(400).json({ ok: false, error: 'Connection request already pending' });
      }
      // If rejected or removed, update to pending
      const { data: updatedCircle, error: updateError } = await supabase
        .from('creator_circles')
        .update({
          status: 'pending',
          initiated_by_profile_id: profileId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingCircle.id)
        .select()
        .single();

      if (updateError) {
        console.error('[Add Circle API] Error updating circle:', updateError);
        return res.status(500).json({ ok: false, error: 'Failed to update connection request' });
      }

      return res.status(200).json({
        ok: true,
        circle: {
          id: updatedCircle.id,
          status: updatedCircle.status,
        },
      });
    }

    // Create new connection request
    // Always set current user as creator_profile_id for consistency
    const { data: newCircle, error: insertError } = await supabase
      .from('creator_circles')
      .insert({
        creator_profile_id: profileId,
        circle_member_profile_id: creatorProfileId,
        status: 'pending',
        initiated_by_profile_id: profileId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Add Circle API] Error creating circle:', insertError);
      return res.status(500).json({ ok: false, error: 'Failed to create connection request' });
    }

    return res.status(200).json({
      ok: true,
      circle: {
        id: newCircle.id,
        status: newCircle.status,
      },
    });
  } catch (error: any) {
    console.error('[Add Circle API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
