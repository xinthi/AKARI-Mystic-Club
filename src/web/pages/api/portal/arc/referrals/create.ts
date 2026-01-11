/**
 * API Route: POST /api/portal/arc/referrals/create
 * 
 * Create a referral (invite a creator to AKARI)
 * Generates an X post URL that can be used to invite the creator
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type CreateReferralResponse =
  | {
      ok: true;
      referral: {
        id: string;
        referrer_profile_id: string;
        referred_profile_id: string;
        x_post_url: string | null;
        referral_code: string | null;
      };
      invitePostUrl: string; // Pre-filled X post URL
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateReferralResponse>
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

    const { referredProfileId, username } = req.body;

    let targetProfileId: string;

    // Support both profileId and username
    if (referredProfileId && typeof referredProfileId === 'string') {
      targetProfileId = referredProfileId;
    } else if (username && typeof username === 'string') {
      // Look up profile ID from username
      const normalizedUsername = username.toLowerCase().replace('@', '').trim();
      const { data: creatorProfile, error: creatorError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', normalizedUsername)
        .single();

      if (creatorError || !creatorProfile) {
        return res.status(404).json({ ok: false, error: 'Creator not found' });
      }
      targetProfileId = creatorProfile.id;
    } else {
      return res.status(400).json({ ok: false, error: 'referredProfileId or username is required' });
    }

    // Cannot refer yourself
    if (targetProfileId === profileId) {
      return res.status(400).json({ ok: false, error: 'Cannot refer yourself' });
    }

    // Check if referral already exists
    const { data: existingReferral, error: checkError } = await supabase
      .from('arc_referrals')
      .select('*')
      .eq('referrer_profile_id', profileId)
      .eq('referred_profile_id', targetProfileId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 = not found, which is fine
      console.error('[Create Referral API] Error checking existing referral:', checkError);
      return res.status(500).json({ ok: false, error: 'Failed to check existing referral' });
    }

    // Get referred creator's username for the invite post
    const { data: referredProfile } = await supabase
      .from('profiles')
      .select('username, name')
      .eq('id', targetProfileId)
      .single();

    if (!referredProfile) {
      return res.status(404).json({ ok: false, error: 'Referred creator not found' });
    }

    const referredUsername = referredProfile.username || username;
    const referredName = referredProfile.name || referredUsername;

    // Generate invite post URL
    const inviteText = `Hey @${referredUsername}! 🚀 Join me on AKARI ARC - the ultimate creator network for Web3. Earn ARC points, build your reputation, and connect with top creators. Check it out: https://akari.ai/portal/arc`;
    const invitePostUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(inviteText)}`;

    if (existingReferral) {
      // Update existing referral
      const { data: updatedReferral, error: updateError } = await supabase
        .from('arc_referrals')
        .update({
          referral_method: 'x_post',
          x_post_url: invitePostUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingReferral.id)
        .select()
        .single();

      if (updateError) {
        console.error('[Create Referral API] Error updating referral:', updateError);
        return res.status(500).json({ ok: false, error: 'Failed to update referral' });
      }

      return res.status(200).json({
        ok: true,
        referral: {
          id: updatedReferral.id,
          referrer_profile_id: updatedReferral.referrer_profile_id,
          referred_profile_id: updatedReferral.referred_profile_id,
          x_post_url: updatedReferral.x_post_url,
          referral_code: updatedReferral.referral_code,
        },
        invitePostUrl,
      });
    }

    // Create new referral
    const { data: newReferral, error: insertError } = await supabase
      .from('arc_referrals')
      .insert({
        referrer_profile_id: profileId,
        referred_profile_id: targetProfileId,
        referral_method: 'x_post',
        x_post_url: invitePostUrl,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Create Referral API] Error creating referral:', insertError);
      return res.status(500).json({ ok: false, error: 'Failed to create referral' });
    }

    return res.status(200).json({
      ok: true,
      referral: {
        id: newReferral.id,
        referrer_profile_id: newReferral.referrer_profile_id,
        referred_profile_id: newReferral.referred_profile_id,
        x_post_url: newReferral.x_post_url,
        referral_code: newReferral.referral_code,
      },
      invitePostUrl,
    });
  } catch (error: any) {
    console.error('[Create Referral API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
