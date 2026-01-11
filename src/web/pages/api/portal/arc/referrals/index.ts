/**
 * API Route: GET /api/portal/arc/referrals
 * 
 * List referrals for the current user (as referrer or referred)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { requirePortalUser } from '@/lib/server/require-portal-user';

interface Referral {
  id: string;
  referrer_profile_id: string;
  referred_profile_id: string;
  referral_method: string;
  referral_code: string | null;
  x_post_url: string | null;
  status: 'pending' | 'accepted' | 'joined_arc' | 'expired';
  accepted_at: string | null;
  joined_arc_at: string | null;
  created_at: string;
  // Populated profile info
  referrer_profile?: {
    id: string;
    username: string;
    name: string;
    profile_image_url: string | null;
  };
  referred_profile?: {
    id: string;
    username: string;
    name: string;
    profile_image_url: string | null;
  };
  // Stats
  total_rewards?: number;
  total_referred_points?: number;
}

type ReferralsResponse =
  | {
      ok: true;
      referrals: Referral[];
      asReferrer: Referral[];
      asReferred: Referral[];
      stats: {
        totalReferrals: number;
        acceptedReferrals: number;
        joinedArcReferrals: number;
        totalRewardsEarned: number;
        totalReferredPoints: number;
      };
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReferralsResponse>
) {
  if (req.method !== 'GET') {
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

    // Get all referrals where user is referrer or referred
    const { data: referrals, error: referralsError } = await supabase
      .from('arc_referrals')
      .select('*')
      .or(`referrer_profile_id.eq.${profileId},referred_profile_id.eq.${profileId}`)
      .order('created_at', { ascending: false });

    if (referralsError) {
      console.error('[Referrals API] Error fetching referrals:', referralsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch referrals' });
    }

    // Get unique profile IDs
    const profileIds = new Set<string>();
    (referrals || []).forEach((r) => {
      profileIds.add(r.referrer_profile_id);
      profileIds.add(r.referred_profile_id);
    });

    // Fetch profile info
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, name, profile_image_url')
      .in('id', Array.from(profileIds));

    if (profilesError) {
      console.error('[Referrals API] Error fetching profiles:', profilesError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch profiles' });
    }

    const profilesMap = new Map((profiles || []).map((p) => [p.id, p]));

    // Get reward stats for referrals where user is referrer
    const referralIds = (referrals || [])
      .filter((r) => r.referrer_profile_id === profileId)
      .map((r) => r.id);

    let totalRewardsEarned = 0;
    let totalReferredPoints = 0;

    if (referralIds.length > 0) {
      const { data: rewards } = await supabase
        .from('arc_referral_rewards')
        .select('reward_points, arc_points_earned, status')
        .in('referral_id', referralIds)
        .eq('status', 'credited');

      if (rewards) {
        totalRewardsEarned = rewards.reduce((sum, r) => sum + Number(r.reward_points || 0), 0);
        totalReferredPoints = rewards.reduce((sum, r) => sum + Number(r.arc_points_earned || 0), 0);
      }
    }

    // Enrich referrals with profile info
    const enrichedReferrals: Referral[] = (referrals || []).map((r) => ({
      ...r,
      referrer_profile: profilesMap.get(r.referrer_profile_id),
      referred_profile: profilesMap.get(r.referred_profile_id),
    }));

    const asReferrer = enrichedReferrals.filter((r) => r.referrer_profile_id === profileId);
    const asReferred = enrichedReferrals.filter((r) => r.referred_profile_id === profileId);

    const stats = {
      totalReferrals: asReferrer.length,
      acceptedReferrals: asReferrer.filter((r) => r.status === 'accepted' || r.status === 'joined_arc').length,
      joinedArcReferrals: asReferrer.filter((r) => r.status === 'joined_arc').length,
      totalRewardsEarned,
      totalReferredPoints,
    };

    return res.status(200).json({
      ok: true,
      referrals: enrichedReferrals,
      asReferrer,
      asReferred,
      stats,
    });
  } catch (error: any) {
    console.error('[Referrals API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
