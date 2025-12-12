/**
 * Process Inner Circle - Web-compatible Implementation
 * 
 * This module processes inner circle data for a project.
 * It's designed to work within Next.js/Vercel without dotenv/config imports.
 * 
 * Features:
 * - Fetches followers from Twitter API
 * - Scores and upserts profiles
 * - Selects top profiles for inner circle
 * - Updates project_inner_circle and inner_circle_members tables
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  unifiedGetUserFollowers,
  UnifiedUserProfile,
} from '../../../../server/twitterClient';
import {
  computeInfluenceScore,
  computeAuthenticityScore,
} from '../../../../server/scoring/profile';
import {
  computeProjectCircleWeight,
  segmentProfile,
} from '../../../../server/scoring/circles';
import {
  SENTIMENT_CONFIG,
  type InnerCircleRunOptions,
} from '../../../../server/config/sentiment.config';

// Re-export for consumers
export type { InnerCircleRunOptions } from '../../../../server/config/sentiment.config';

// =============================================================================
// TYPES
// =============================================================================

export interface InnerCircleProject {
  id: string;
  slug: string;
  name: string;
  twitter_username: string;
}

export interface InnerCircleResult {
  followersPulled: number;
  profilesUpserted: number;
  innerCircleSize: number;
  innerCirclePower: number;
}

interface ProfileData {
  twitter_id: string;
  username: string;
  name: string;
  profile_image_url: string | null;
  bio: string | null;
  followers: number;
  following: number;
  tweet_count: number;
  is_blue_verified: boolean;
  created_at_twitter: string | null;
  akari_profile_score: number;
  authenticity_score: number;
  influence_score: number;
  signal_density_score: number;
  farm_risk_score: number;
}

interface ScoredProfile {
  profileId: string;
  username: string;
  akariScore: number;
  influenceScore: number;
  farmRiskScore: number;
  bio: string;
  followers: number;
}

// =============================================================================
// SCORING HELPERS
// =============================================================================

/**
 * Quick score a profile from basic data (without fetching tweets)
 * This is faster than full profile scoring for bulk operations
 */
function quickScoreProfile(user: UnifiedUserProfile): {
  akariProfileScore: number;
  authenticityScore: number;
  influenceScore: number;
  signalDensityScore: number;
  farmRiskScore: number;
} {
  // Calculate account age
  const createdDate = user.createdAt ? new Date(user.createdAt) : new Date();
  const accountAgeDays = Math.floor(
    (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Estimate engagement rate from tweet count and followers
  const activityRatio = user.followers > 0 ? user.tweetCount / user.followers : 0;
  const estimatedEngagementRate = Math.min(0.1, activityRatio * 0.01);

  // Estimate follower quality ratio based on followers count
  const estimatedQualityRatio = Math.min(0.8, 0.3 + Math.log10(user.followers + 1) / 10);

  // Estimate retweet ratio (assume 30% for unknown accounts)
  const estimatedRetweetRatio = 0.3;

  // Compute authenticity score
  const authenticityScore = computeAuthenticityScore(
    user.followers,
    estimatedEngagementRate,
    estimatedQualityRatio,
    estimatedRetweetRatio,
    accountAgeDays
  );

  // Compute influence score
  const estimatedVerifiedFollowers = Math.floor(user.followers * 0.05);
  const influenceScore = computeInfluenceScore(
    user.followers,
    user.isVerified,
    Math.min(10, estimatedVerifiedFollowers)
  );

  // Signal density score - estimate based on bio and verification
  let signalDensityScore = 50;
  if (user.bio && user.bio.length > 50) signalDensityScore += 10;
  if (user.isVerified) signalDensityScore += 15;
  if (accountAgeDays > 365) signalDensityScore += 10;
  signalDensityScore = Math.min(100, signalDensityScore);

  // Farm risk score - estimate based on patterns
  let farmRiskScore = 0;
  if (user.followers < 100 && user.following > 1000) farmRiskScore += 30;
  if (user.tweetCount < 10) farmRiskScore += 10;
  if (accountAgeDays < 30) farmRiskScore += 20;
  if (user.following > user.followers * 10) farmRiskScore += 20;
  farmRiskScore = Math.min(100, farmRiskScore);

  // Compute final AKARI Profile Score
  const authFinal = authenticityScore * (1 - farmRiskScore * 0.5 / 100);
  const score0to100 =
    0.35 * authFinal +
    0.35 * signalDensityScore +
    0.30 * influenceScore;
  const akariProfileScore = Math.round(Math.max(0, Math.min(1000, score0to100 * 10)));

  return {
    akariProfileScore,
    authenticityScore,
    influenceScore,
    signalDensityScore,
    farmRiskScore,
  };
}

// =============================================================================
// DATABASE OPERATIONS
// =============================================================================

/**
 * Upsert a profile into the database
 */
async function upsertProfile(
  supabase: SupabaseClient,
  user: UnifiedUserProfile
): Promise<string | null> {
  const scores = quickScoreProfile(user);

  const profileData: ProfileData = {
    twitter_id: user.id,
    username: user.username,
    name: user.name || user.username,
    profile_image_url: user.profileImageUrl || null,
    bio: user.bio || null,
    followers: user.followers,
    following: user.following,
    tweet_count: user.tweetCount,
    is_blue_verified: user.isVerified,
    created_at_twitter: user.createdAt || null,
    akari_profile_score: scores.akariProfileScore,
    authenticity_score: scores.authenticityScore,
    influence_score: scores.influenceScore,
    signal_density_score: scores.signalDensityScore,
    farm_risk_score: scores.farmRiskScore,
  };

  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      ...profileData,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'twitter_id',
      ignoreDuplicates: false,
    })
    .select('id')
    .single();

  if (error) {
    // Try by username if twitter_id conflict
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', user.username)
      .single();

    if (existing) {
      await supabase
        .from('profiles')
        .update({
          ...profileData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      return existing.id;
    }

    console.log(`[InnerCircle] Error upserting profile ${user.username}:`, error.message);
    return null;
  }

  return data?.id || null;
}

/**
 * Ensure profile is in inner_circle_members if qualified
 */
async function ensureInnerCircleMember(
  supabase: SupabaseClient,
  profileId: string,
  akariScore: number,
  influenceScore: number,
  bio: string
): Promise<void> {
  const segment = segmentProfile(bio);

  const { error } = await supabase
    .from('inner_circle_members')
    .upsert({
      profile_id: profileId,
      akari_profile_score: akariScore,
      influence_score: influenceScore,
      segment,
      added_at: new Date().toISOString(),
    }, {
      onConflict: 'profile_id',
      ignoreDuplicates: false,
    });

  if (error && !error.message.includes('duplicate')) {
    console.log(`[InnerCircle] Error upserting inner_circle_member:`, error.message);
  }
}

/**
 * Update project inner circle
 */
async function updateProjectInnerCircle(
  supabase: SupabaseClient,
  projectId: string,
  projectHandle: string,
  members: {
    profileId: string;
    username: string;
    akariScore: number;
    influenceScore: number;
  }[]
): Promise<{ count: number; power: number }> {
  // Clear existing project inner circle
  await supabase
    .from('project_inner_circle')
    .delete()
    .eq('project_id', projectId);

  if (members.length === 0) {
    return { count: 0, power: 0 };
  }

  // Insert new members
  const insertData = members.map(m => {
    const isOfficial = m.username.toLowerCase() === projectHandle.toLowerCase();
    const weight = computeProjectCircleWeight(
      m.akariScore,
      true,  // is_follower
      isOfficial,  // is_author
      0  // days since interaction (fresh)
    );

    return {
      project_id: projectId,
      profile_id: m.profileId,
      is_follower: true,
      is_author: isOfficial,
      weight,
      last_interaction_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from('project_inner_circle')
    .insert(insertData);

  if (error) {
    console.log(`[InnerCircle] Error inserting project_inner_circle:`, error.message);
    return { count: 0, power: 0 };
  }

  // Calculate total power
  const power = members.reduce((sum, m) => sum + m.influenceScore, 0);

  return { count: members.length, power };
}

/**
 * Update project stats
 */
async function updateProjectStats(
  supabase: SupabaseClient,
  projectId: string,
  innerCircleCount: number,
  innerCirclePower: number
): Promise<void> {
  // Update projects table
  const { error: projectError } = await supabase
    .from('projects')
    .update({
      inner_circle_count: innerCircleCount,
      inner_circle_power: innerCirclePower,
      last_scored_at: new Date().toISOString(),
    })
    .eq('id', projectId);

  if (projectError) {
    console.log(`[InnerCircle] Error updating project stats:`, projectError.message);
  }

  // Update metrics_daily for today
  const today = new Date().toISOString().split('T')[0];

  const { error: metricsError } = await supabase
    .from('metrics_daily')
    .update({
      inner_circle_count: innerCircleCount,
    })
    .eq('project_id', projectId)
    .eq('date', today);

  // If no row exists for today, create one
  if (metricsError) {
    await supabase
      .from('metrics_daily')
      .upsert({
        project_id: projectId,
        date: today,
        inner_circle_count: innerCircleCount,
      }, { onConflict: 'project_id,date' });
  }
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Process a single project's inner circle.
 *
 * @param supabase - Supabase client with service role
 * @param project - The project to process
 * @param options - Optional limits for followers/inner circle size
 */
export async function processInnerCircleById(
  supabase: SupabaseClient,
  project: InnerCircleProject,
  options: InnerCircleRunOptions = {}
): Promise<InnerCircleResult> {
  // Apply defaults from centralized config
  const maxFollowersToFetch = options.maxFollowersToFetch ?? SENTIMENT_CONFIG.innerCircle.maxFollowersToFetch;
  const maxInnerCircleSize = options.maxInnerCircleSize ?? SENTIMENT_CONFIG.innerCircle.maxInnerCircleSize;
  const minFollowersForIC = SENTIMENT_CONFIG.innerCircle.minFollowersForQualification;
  const maxFarmRiskForIC = SENTIMENT_CONFIG.innerCircle.maxFarmRiskScore;

  const stats: InnerCircleResult = {
    followersPulled: 0,
    profilesUpserted: 0,
    innerCircleSize: 0,
    innerCirclePower: 0,
  };

  console.log(`[InnerCircle] Processing: ${project.name} (@${project.twitter_username})`);

  try {
    // Step 1: Fetch followers
    console.log(`[InnerCircle]   Fetching up to ${maxFollowersToFetch} followers...`);
    const followers = await unifiedGetUserFollowers(project.twitter_username, maxFollowersToFetch);
    stats.followersPulled = followers.length;
    console.log(`[InnerCircle]   Fetched ${followers.length} followers`);

    if (followers.length === 0) {
      console.log(`[InnerCircle]   ⚠️ No followers found, skipping`);
      return stats;
    }

    // Step 2: Score and upsert profiles
    console.log(`[InnerCircle]   Scoring and upserting profiles...`);
    const scoredProfiles: ScoredProfile[] = [];

    for (const follower of followers) {
      const scores = quickScoreProfile(follower);
      const profileId = await upsertProfile(supabase, follower);

      if (profileId) {
        stats.profilesUpserted++;
        scoredProfiles.push({
          profileId,
          username: follower.username,
          akariScore: scores.akariProfileScore,
          influenceScore: scores.influenceScore,
          farmRiskScore: scores.farmRiskScore,
          bio: follower.bio || '',
          followers: follower.followers,
        });
      }
    }

    console.log(`[InnerCircle]   Upserted ${stats.profilesUpserted} profiles`);

    // Step 3: Filter and select inner circle members
    console.log(`[InnerCircle]   Selecting inner circle members...`);

    // Filter: minimum followers, not high farm risk
    const qualifiedProfiles = scoredProfiles.filter(p =>
      p.followers >= minFollowersForIC && p.farmRiskScore < maxFarmRiskForIC
    );

    // Sort by akari_profile_score + influence_score
    qualifiedProfiles.sort((a, b) =>
      (b.akariScore + b.influenceScore) - (a.akariScore + a.influenceScore)
    );

    // Take top N
    const innerCircleMembers = qualifiedProfiles.slice(0, maxInnerCircleSize);

    console.log(`[InnerCircle]   Qualified profiles: ${qualifiedProfiles.length}, selecting top ${innerCircleMembers.length}`);

    // Step 4: Update inner_circle_members table
    for (const member of innerCircleMembers) {
      await ensureInnerCircleMember(
        supabase,
        member.profileId,
        member.akariScore,
        member.influenceScore,
        member.bio
      );
    }

    // Step 5: Update project_inner_circle
    const { count, power } = await updateProjectInnerCircle(
      supabase,
      project.id,
      project.twitter_username,
      innerCircleMembers.map(m => ({
        profileId: m.profileId,
        username: m.username,
        akariScore: m.akariScore,
        influenceScore: m.influenceScore,
      }))
    );

    stats.innerCircleSize = count;
    stats.innerCirclePower = power;

    // Step 6: Update project stats
    await updateProjectStats(supabase, project.id, count, power);

    console.log(`[InnerCircle]   ✅ Inner circle updated: ${count} members, power: ${power}`);

  } catch (error: any) {
    console.log(`[InnerCircle]   ❌ Error processing project:`, error.message);
  }

  return stats;
}

