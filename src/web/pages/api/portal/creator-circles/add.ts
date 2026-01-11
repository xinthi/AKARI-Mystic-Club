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
    const user = await requirePortalUser(req, res);
    if (!user) {
      return; // requirePortalUser already sent 401 response
    }
    const profileId = user.profileId;
    if (!profileId) {
      return res.status(403).json({ ok: false, error: 'Profile not found' });
    }
    const supabase = createPortalClient();

    const { creatorProfileId, username } = req.body;

    let targetProfileId: string;

    // Support both profileId and username
    if (creatorProfileId && typeof creatorProfileId === 'string') {
      targetProfileId = creatorProfileId;
    } else if (username && typeof username === 'string') {
      // Look up profile ID from username
      const normalizedUsername = username.toLowerCase().replace('@', '').trim();
      let { data: creatorProfile, error: creatorError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', normalizedUsername)
        .single();

      // If profile doesn't exist, try to create it from Twitter
      if (creatorError || !creatorProfile) {
        try {
          const { getUserProfile } = await import('@/lib/twitter/twitter');
          const { upsertProfileFromTwitter } = await import('@/lib/portal/profile-sync');
          const { getSupabaseAdmin } = await import('@/lib/supabase-admin');
          
          const twitterProfile = await getUserProfile(normalizedUsername);
          if (twitterProfile) {
            const supabaseAdmin = getSupabaseAdmin();
            const profileId = await upsertProfileFromTwitter(supabaseAdmin, twitterProfile);
            if (profileId) {
              // Fetch the newly created profile
              const { data: newProfile } = await supabase
                .from('profiles')
                .select('id')
                .eq('id', profileId)
                .single();
              creatorProfile = newProfile;
            }
          }
        } catch (twitterError) {
          console.warn('[Add Circle API] Could not fetch/create profile from Twitter:', twitterError);
        }
      }

      if (!creatorProfile) {
        return res.status(404).json({ ok: false, error: 'Creator not found. Please make sure the creator exists on X/Twitter.' });
      }
      targetProfileId = creatorProfile.id;
    } else {
      return res.status(400).json({ ok: false, error: 'creatorProfileId or username is required' });
    }

    // Cannot add yourself
    if (targetProfileId === profileId) {
      return res.status(400).json({ ok: false, error: 'Cannot add yourself to your circle' });
    }

    // Verify creator exists (double-check)
    const { data: creatorProfile, error: creatorError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', targetProfileId)
      .single();

    if (creatorError || !creatorProfile) {
      return res.status(404).json({ ok: false, error: 'Creator not found' });
    }

    // Check if connection already exists
    const { data: existingCircle, error: checkError } = await supabase
      .from('creator_circles')
      .select('*')
      .or(`and(creator_profile_id.eq.${profileId},circle_member_profile_id.eq.${targetProfileId}),and(creator_profile_id.eq.${targetProfileId},circle_member_profile_id.eq.${profileId})`)
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
        circle_member_profile_id: targetProfileId,
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
