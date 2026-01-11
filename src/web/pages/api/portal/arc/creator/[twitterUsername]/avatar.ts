/**
 * API Route: GET /api/portal/arc/creator/[twitterUsername]/avatar
 * 
 * Fetch or refresh the avatar for a creator profile
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getUserProfile } from '@/lib/twitter/twitter';
import { upsertProfileFromTwitter } from '@/lib/portal/profile-sync';

type AvatarResponse =
  | {
      ok: true;
      avatarUrl: string;
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AvatarResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { twitterUsername } = req.query;
    
    if (!twitterUsername || typeof twitterUsername !== 'string') {
      return res.status(400).json({ ok: false, error: 'Invalid username' });
    }

    const supabase = createPortalClient();
    const supabaseAdmin = getSupabaseAdmin();
    const normalizedUsername = twitterUsername.toLowerCase().trim().replace(/^@+/, '');

    // First check if profile exists with avatar
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, profile_image_url')
      .eq('username', normalizedUsername)
      .single();

    // If profile has avatar, return it
    if (profileData?.profile_image_url && profileData.profile_image_url.startsWith('http')) {
      return res.status(200).json({
        ok: true,
        avatarUrl: profileData.profile_image_url,
      });
    }

    // Try to fetch from Twitter
    try {
      const twitterProfile = await getUserProfile(normalizedUsername);
      
      if (twitterProfile && (twitterProfile.profileImageUrl || twitterProfile.avatarUrl)) {
        const avatarUrl = twitterProfile.profileImageUrl || twitterProfile.avatarUrl;
        
        // Ensure avatarUrl is a valid string
        if (!avatarUrl || typeof avatarUrl !== 'string') {
          return res.status(404).json({ ok: false, error: 'Avatar not found' });
        }
        
        // Update profile in database
        if (profileData?.id) {
          await supabaseAdmin
            .from('profiles')
            .update({
              profile_image_url: avatarUrl,
              updated_at: new Date().toISOString(),
            })
            .eq('id', profileData.id);
        } else {
          // Create profile if it doesn't exist
          await upsertProfileFromTwitter(supabaseAdmin, twitterProfile);
        }
        
        return res.status(200).json({
          ok: true,
          avatarUrl: avatarUrl,
        });
      }
    } catch (twitterError) {
      console.error('[Avatar API] Error fetching from Twitter:', twitterError);
    }

    return res.status(404).json({ ok: false, error: 'Avatar not found' });
  } catch (error: any) {
    console.error('[Avatar API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
