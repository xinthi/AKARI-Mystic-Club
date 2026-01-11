/**
 * ARC Referral Rewards Helper
 * 
 * Functions to calculate and credit referral rewards when creators earn ARC points
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const DEFAULT_REWARD_PERCENTAGE = 5.0; // 5% of ARC points earned

/**
 * Calculate and create referral rewards when a creator earns ARC points
 * 
 * @param supabase - Supabase admin client
 * @param creatorProfileId - Profile ID of the creator who earned points
 * @param arenaId - Arena ID where points were earned
 * @param pointsEarned - Amount of ARC points earned (increase)
 * @returns Number of rewards created
 */
export async function calculateReferralRewards(
  supabase: SupabaseClient,
  creatorProfileId: string,
  arenaId: string,
  pointsEarned: number
): Promise<number> {
  if (pointsEarned <= 0) {
    return 0;
  }

  try {
    // Find active referral for this creator
    const { data: referral, error: referralError } = await supabase
      .from('arc_referrals')
      .select('id, referrer_profile_id, status')
      .eq('referred_profile_id', creatorProfileId)
      .in('status', ['accepted', 'joined_arc'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (referralError || !referral) {
      // No referral found - that's ok
      return 0;
    }

    // Get project_id from arena
    const { data: arena, error: arenaError } = await supabase
      .from('arenas')
      .select('project_id')
      .eq('id', arenaId)
      .single();

    if (arenaError || !arena) {
      console.warn('[Referral Rewards] Arena not found:', arenaId);
      return 0;
    }

    // Calculate reward points
    const rewardPoints = (pointsEarned * DEFAULT_REWARD_PERCENTAGE) / 100.0;

    // Only create reward if it's significant (> 0.01 points)
    if (rewardPoints < 0.01) {
      return 0;
    }

    // Create reward record
    const { error: insertError } = await supabase
      .from('arc_referral_rewards')
      .insert({
        referral_id: referral.id,
        referrer_profile_id: referral.referrer_profile_id,
        referred_profile_id: creatorProfileId,
        arena_id: arenaId,
        project_id: arena.project_id,
        arc_points_earned: pointsEarned,
        reward_percentage: DEFAULT_REWARD_PERCENTAGE,
        reward_points: rewardPoints,
        reward_type: 'arc_points',
        status: 'pending',
      });

    if (insertError) {
      console.error('[Referral Rewards] Error creating reward:', insertError);
      return 0;
    }

    // Auto-credit the reward (update referrer's ARC points)
    await creditReferralReward(supabase, referral.referrer_profile_id, rewardPoints);

    return 1;
  } catch (error: any) {
    console.error('[Referral Rewards] Error calculating rewards:', error);
    return 0;
  }
}

/**
 * Mark referral as "joined_arc" when creator joins their first arena
 * 
 * @param supabase - Supabase admin client
 * @param creatorProfileId - Profile ID of the creator who joined
 */
export async function markReferralAsJoinedArc(
  supabase: SupabaseClient,
  creatorProfileId: string
): Promise<void> {
  try {
    // Find pending/accepted referrals for this creator
    const { data: referrals, error: referralsError } = await supabase
      .from('arc_referrals')
      .select('id, status')
      .eq('referred_profile_id', creatorProfileId)
      .in('status', ['pending', 'accepted']);

    if (referralsError || !referrals || referrals.length === 0) {
      return;
    }

    // Update all referrals to "joined_arc" status
    for (const referral of referrals) {
      await supabase
        .from('arc_referrals')
        .update({
          status: 'joined_arc',
          joined_arc_at: new Date().toISOString(),
        })
        .eq('id', referral.id);
    }
  } catch (error: any) {
    console.error('[Referral Rewards] Error marking referral as joined:', error);
  }
}

/**
 * Credit a referral reward to the referrer's ARC points
 * 
 * @param supabase - Supabase admin client
 * @param referrerProfileId - Profile ID of the referrer
 * @param rewardPoints - Points to credit
 */
async function creditReferralReward(
  supabase: SupabaseClient,
  referrerProfileId: string,
  rewardPoints: number
): Promise<void> {
  try {
    // Find all arenas where the referrer is a creator
    const { data: creatorArenas, error: arenasError } = await supabase
      .from('arena_creators')
      .select('id, arena_id, arc_points')
      .eq('profile_id', referrerProfileId);

    if (arenasError || !creatorArenas || creatorArenas.length === 0) {
      // Referrer might not be in any arenas yet - that's ok
      return;
    }

    // Distribute reward points across all arenas (or add to first arena)
    // For now, add to the first arena
    const firstArena = creatorArenas[0];
    const newPoints = (firstArena.arc_points || 0) + rewardPoints;

    const { error: updateError } = await supabase
      .from('arena_creators')
      .update({ arc_points: newPoints })
      .eq('id', firstArena.id);

    if (updateError) {
      console.error('[Referral Rewards] Error crediting reward:', updateError);
    } else {
      // Update reward status to credited
      await supabase
        .from('arc_referral_rewards')
        .update({ status: 'credited', credited_at: new Date().toISOString() })
        .eq('referrer_profile_id', referrerProfileId)
        .eq('status', 'pending')
        .limit(1);
    }
  } catch (error: any) {
    console.error('[Referral Rewards] Error crediting reward:', error);
  }
}

/**
 * Process referral rewards for a batch of ARC point updates
 * 
 * @param updates - Array of { creatorProfileId, arenaId, pointsEarned }
 * @returns Total rewards created
 */
export async function processReferralRewardsBatch(
  updates: Array<{ creatorProfileId: string; arenaId: string; pointsEarned: number }>
): Promise<number> {
  const supabase = getSupabaseAdmin();
  let totalRewards = 0;

  for (const update of updates) {
    const rewards = await calculateReferralRewards(
      supabase,
      update.creatorProfileId,
      update.arenaId,
      update.pointsEarned
    );
    totalRewards += rewards;
  }

  return totalRewards;
}
