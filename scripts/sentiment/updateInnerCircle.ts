/**
 * Update Inner Circle Script
 * 
 * This script populates inner circle data for projects:
 * 1. Fetches followers for each project using TwitterAPI.io
 * 2. Upserts followers into profiles table with scoring
 * 3. Selects top profiles for each project's inner circle
 * 4. Updates inner_circle_members and project_inner_circle tables
 * 5. Updates project stats (inner_circle_count, inner_circle_power)
 * 
 * Run with: pnpm inner-circle:update
 * Schedule: Run daily after updateAllProjects.ts
 */

import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  unifiedGetUserFollowers,
  unifiedGetUserInfo,
  UnifiedUserProfile,
} from '../../src/server/twitterClient';
import {
  computeInfluenceScore,
  computeAuthenticityScore,
} from '../../src/server/scoring/profile';
import {
  computeProjectCircleWeight,
  segmentProfile,
} from '../../src/server/scoring/circles';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Rate limiting
const DELAY_BETWEEN_PROJECTS_MS = 3000; // 3 seconds between projects
const MAX_FOLLOWERS_TO_FETCH = 500; // Followers to fetch per project
const INNER_CIRCLE_SIZE = 100; // Max inner circle members per project
const MIN_FOLLOWERS_FOR_IC = 200; // Minimum followers for inner circle qualification
const MAX_FARM_RISK_FOR_IC = 50; // Maximum farm risk score for inner circle

// =============================================================================
// HELPERS
// =============================================================================

function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] ${message}`, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// TYPES
// =============================================================================

interface DbProject {
  id: string;
  slug: string;
  name: string;
  twitter_username: string;
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
  // Scores
  akari_profile_score: number;
  authenticity_score: number;
  influence_score: number;
  signal_density_score: number;
  farm_risk_score: number;
}

// =============================================================================
// SIMPLIFIED SCORING
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
  // Higher tweet count per follower = more active
  const activityRatio = user.followers > 0 ? user.tweetCount / user.followers : 0;
  const estimatedEngagementRate = Math.min(0.1, activityRatio * 0.01);

  // Estimate follower quality ratio based on followers count
  // Larger accounts tend to have better quality (rough heuristic)
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

  // Compute influence score (we don't have verified followers count, assume 5%)
  const estimatedVerifiedFollowers = Math.floor(user.followers * 0.05);
  const influenceScore = computeInfluenceScore(
    user.followers,
    user.isVerified,
    Math.min(10, estimatedVerifiedFollowers) // Cap at 10 for estimate
  );

  // Signal density score - estimate based on bio and verification
  let signalDensityScore = 50; // Base score
  if (user.bio && user.bio.length > 50) signalDensityScore += 10;
  if (user.isVerified) signalDensityScore += 15;
  if (accountAgeDays > 365) signalDensityScore += 10;
  signalDensityScore = Math.min(100, signalDensityScore);

  // Farm risk score - estimate based on patterns
  let farmRiskScore = 0;
  if (user.followers < 100 && user.following > 1000) farmRiskScore += 30; // Follow farming
  if (user.tweetCount < 10) farmRiskScore += 10; // Inactive
  if (accountAgeDays < 30) farmRiskScore += 20; // New account
  if (user.following > user.followers * 10) farmRiskScore += 20; // Follow ratio
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
 * Get all active projects with twitter_username.
 * 
 * IMPORTANT: twitter_username is an admin-controlled field.
 * This script only processes projects that already have a handle set.
 * It does NOT modify twitter_username.
 */
async function getActiveProjects(supabase: SupabaseClient): Promise<DbProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name, twitter_username')
    .eq('is_active', true)
    .not('twitter_username', 'is', null);

  if (error) {
    log('Error fetching projects:', error.message);
    return [];
  }

  // Only return projects with a valid twitter_username
  return (data || []).filter(p => p.twitter_username?.trim()) as DbProject[];
}

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
      ignoreDuplicates: false 
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
      // Update existing profile
      await supabase
        .from('profiles')
        .update({
          ...profileData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      return existing.id;
    }
    
    log(`Error upserting profile ${user.username}:`, error.message);
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
      ignoreDuplicates: false 
    });

  if (error && !error.message.includes('duplicate')) {
    log(`Error upserting inner_circle_member:`, error.message);
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
    log(`Error inserting project_inner_circle:`, error.message);
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
    log(`Error updating project stats:`, projectError.message);
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

async function processProject(
  supabase: SupabaseClient,
  project: DbProject
): Promise<{ 
  followersPulled: number;
  profilesUpserted: number;
  innerCircleSize: number;
  innerCirclePower: number;
}> {
  const stats = {
    followersPulled: 0,
    profilesUpserted: 0,
    innerCircleSize: 0,
    innerCirclePower: 0,
  };

  log(`Processing: ${project.name} (@${project.twitter_username})`);

  try {
    // Step 1: Fetch followers
    log(`  Fetching up to ${MAX_FOLLOWERS_TO_FETCH} followers...`);
    const followers = await unifiedGetUserFollowers(project.twitter_username, MAX_FOLLOWERS_TO_FETCH);
    stats.followersPulled = followers.length;
    log(`  Fetched ${followers.length} followers`);

    if (followers.length === 0) {
      log(`  ⚠️ No followers found, skipping`);
      return stats;
    }

    // Step 2: Score and upsert profiles
    log(`  Scoring and upserting profiles...`);
    const scoredProfiles: {
      profileId: string;
      username: string;
      akariScore: number;
      influenceScore: number;
      farmRiskScore: number;
      bio: string;
    }[] = [];

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
        });
      }
    }

    log(`  Upserted ${stats.profilesUpserted} profiles`);

    // Step 3: Filter and select inner circle members
    log(`  Selecting inner circle members...`);
    
    // Filter: minimum followers, not high farm risk
    const qualifiedProfiles = scoredProfiles.filter(p => {
      const follower = followers.find(f => f.username === p.username);
      return (
        follower &&
        follower.followers >= MIN_FOLLOWERS_FOR_IC &&
        p.farmRiskScore < MAX_FARM_RISK_FOR_IC
      );
    });

    // Sort by akari_profile_score + influence_score
    qualifiedProfiles.sort((a, b) => 
      (b.akariScore + b.influenceScore) - (a.akariScore + a.influenceScore)
    );

    // Take top N
    const innerCircleMembers = qualifiedProfiles.slice(0, INNER_CIRCLE_SIZE);

    log(`  Qualified profiles: ${qualifiedProfiles.length}, selecting top ${innerCircleMembers.length}`);

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

    log(`  ✅ Inner circle updated: ${count} members, power: ${power}`);

  } catch (error: any) {
    log(`  ❌ Error processing project:`, error.message);
  }

  return stats;
}

/**
 * Run the inner circle update job.
 * This function can be called from CLI or from an API route.
 * Returns a summary of the update results.
 */
export async function runInnerCircleUpdate(): Promise<{
  projectsProcessed: number;
  followersPulled: number;
  profilesUpserted: number;
  innerCircleMembers: number;
  totalPower: number;
}> {
  log('========================================');
  log('AKARI Inner Circle Update Script');
  log('========================================');

  // Validate environment
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Get active projects
  const projects = await getActiveProjects(supabase);
  log(`Found ${projects.length} active projects with twitter_username`);

  if (projects.length === 0) {
    log('No projects to process. Exiting.');
    return {
      projectsProcessed: 0,
      followersPulled: 0,
      profilesUpserted: 0,
      innerCircleMembers: 0,
      totalPower: 0,
    };
  }

  // Process each project
  const totals = {
    followersPulled: 0,
    profilesUpserted: 0,
    innerCircleMembers: 0,
    totalPower: 0,
  };

  for (let i = 0; i < projects.length; i++) {
    log(`\n[${i + 1}/${projects.length}] -----------------------`);
    
    const stats = await processProject(supabase, projects[i]);
    
    totals.followersPulled += stats.followersPulled;
    totals.profilesUpserted += stats.profilesUpserted;
    totals.innerCircleMembers += stats.innerCircleSize;
    totals.totalPower += stats.innerCirclePower;

    // Rate limiting between projects
    if (i < projects.length - 1) {
      await sleep(DELAY_BETWEEN_PROJECTS_MS);
    }
  }

  // Summary
  log('\n========================================');
  log('SUMMARY');
  log('========================================');
  log(`Projects processed: ${projects.length}`);
  log(`Total followers pulled: ${totals.followersPulled}`);
  log(`Total profiles upserted: ${totals.profilesUpserted}`);
  log(`Total inner circle members: ${totals.innerCircleMembers}`);
  log(`Total circle power: ${totals.totalPower}`);
  log('========================================');
  log('Inner circle update complete!');

  return {
    projectsProcessed: projects.length,
    ...totals,
  };
}

// =============================================================================
// CLI ENTRY POINT
// =============================================================================

// Run when executed directly (not imported)
if (require.main === module) {
  runInnerCircleUpdate()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

