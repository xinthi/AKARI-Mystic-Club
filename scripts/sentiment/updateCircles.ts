/**
 * Update Circles Script
 * 
 * This script populates and updates:
 * 1. Profiles table - Score Twitter profiles using the AKARI profile scoring algorithm
 * 2. Global Inner Circle - Top CT profiles based on AKARI scores
 * 3. Project Inner Circles - Profiles that engage with specific projects
 * 4. Competitor similarity - Based on inner circle overlap
 * 
 * Run with: pnpm circles:update
 * Schedule: Run daily after updateAllProjects.ts
 */

import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  unifiedGetUserInfo, 
  unifiedGetUserLastTweets,
  unifiedGetUserFollowers,
  unifiedGetUserVerifiedFollowers,
  unifiedAdvancedSearchTweets,
  unifiedSearchUsers,
  UnifiedUserProfile,
} from '../../src/server/twitterClient';
import {
  scoreProfile,
  ProfileScoreResult,
} from '../../src/server/scoring/profile';
import {
  qualifiesForGlobalInnerCircle,
  computeProjectCircleWeight,
  computeCommonInnerCircle,
  segmentProfile,
  GLOBAL_INNER_CIRCLE_CRITERIA,
  GLOBAL_INNER_CIRCLE_MAX_SIZE,
  InnerCircleMember,
} from '../../src/server/scoring/circles';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Rate limiting
const DELAY_BETWEEN_PROFILES_MS = 2000; // 2 seconds between profile scoring
const DELAY_BETWEEN_PROJECTS_MS = 3000; // 3 seconds between project circle updates
const MAX_PROFILES_PER_RUN = 100; // Limit profiles to score per run
const MAX_FOLLOWERS_TO_SAMPLE = 50; // Followers to sample per project

// =============================================================================
// HELPERS
// =============================================================================

function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}`, data);
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// DATABASE OPERATIONS
// =============================================================================

interface DbProfile {
  id: string;
  twitter_id: string | null;
  username: string;
  name: string | null;
  profile_image_url: string | null;
  bio: string | null;
  followers: number;
  following: number;
  tweet_count: number;
  is_blue_verified: boolean;
  verified_type: string | null;
  created_at_twitter: string | null;
  akari_profile_score: number | null;
  authenticity_score: number | null;
  influence_score: number | null;
  signal_density_score: number | null;
  farm_risk_score: number | null;
  last_scored_at: string | null;
}

interface DbProject {
  id: string;
  slug: string;
  name: string;
  twitter_username: string | null;
}

/**
 * Upsert a profile into the database
 */
async function upsertProfile(
  supabase: SupabaseClient,
  user: UnifiedUserProfile,
  scores: ProfileScoreResult | null
): Promise<string | null> {
  const profileData = {
    twitter_id: user.id || null,
    username: user.username,
    name: user.name,
    profile_image_url: user.profileImageUrl,
    bio: user.bio,
    followers: user.followers,
    following: user.following,
    tweet_count: user.tweetCount,
    is_blue_verified: user.isVerified,
    verified_type: user.verifiedType,
    created_at_twitter: user.createdAt || null,
    akari_profile_score: scores?.akariProfileScore ?? null,
    authenticity_score: scores?.authenticityScore ?? null,
    influence_score: scores?.influenceScore ?? null,
    signal_density_score: scores?.signalDensityScore ?? null,
    farm_risk_score: scores?.farmRiskScore ?? null,
    last_scored_at: scores ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('profiles')
    .upsert(profileData, { onConflict: 'username' })
    .select('id')
    .single();

  if (error) {
    log(`Error upserting profile ${user.username}:`, error.message);
    return null;
  }

  return data?.id || null;
}

/**
 * Get profiles that need scoring (never scored or scored > 7 days ago)
 */
async function getProfilesToScore(
  supabase: SupabaseClient,
  limit: number
): Promise<DbProfile[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .or(`last_scored_at.is.null,last_scored_at.lt.${sevenDaysAgo.toISOString()}`)
    .order('followers', { ascending: false })
    .limit(limit);

  if (error) {
    log('Error fetching profiles to score:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get all profiles with scores for inner circle calculation
 */
async function getScoredProfiles(supabase: SupabaseClient): Promise<DbProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .not('akari_profile_score', 'is', null)
    .order('akari_profile_score', { ascending: false });

  if (error) {
    log('Error fetching scored profiles:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get all active projects
 */
async function getActiveProjects(supabase: SupabaseClient): Promise<DbProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name, twitter_username')
    .eq('is_active', true);

  if (error) {
    log('Error fetching projects:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Update the global inner circle table
 */
async function updateGlobalInnerCircle(
  supabase: SupabaseClient,
  members: { profileId: string; akariScore: number; influenceScore: number; segment: string }[]
): Promise<number> {
  // Clear existing inner circle
  await supabase.from('inner_circle_members').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  if (members.length === 0) return 0;

  // Insert new members
  const insertData = members.map(m => ({
    profile_id: m.profileId,
    akari_profile_score: m.akariScore,
    influence_score: m.influenceScore,
    segment: m.segment,
    added_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('inner_circle_members')
    .insert(insertData);

  if (error) {
    log('Error inserting inner circle members:', error.message);
    return 0;
  }

  return members.length;
}

/**
 * Update project inner circle
 */
async function updateProjectInnerCircle(
  supabase: SupabaseClient,
  projectId: string,
  members: { profileId: string; isFollower: boolean; isAuthor: boolean; weight: number }[]
): Promise<number> {
  // Clear existing project inner circle
  await supabase
    .from('project_inner_circle')
    .delete()
    .eq('project_id', projectId);

  if (members.length === 0) return 0;

  // Insert new members
  const insertData = members.map(m => ({
    project_id: projectId,
    profile_id: m.profileId,
    is_follower: m.isFollower,
    is_author: m.isAuthor,
    weight: m.weight,
    last_interaction_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('project_inner_circle')
    .insert(insertData);

  if (error) {
    log(`Error inserting project inner circle for ${projectId}:`, error.message);
    return 0;
  }

  return members.length;
}

/**
 * Update project stats
 */
async function updateProjectStats(
  supabase: SupabaseClient,
  projectId: string,
  stats: { innerCircleCount: number; innerCirclePower: number; qualityFollowerRatio: number }
): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({
      inner_circle_count: stats.innerCircleCount,
      inner_circle_power: stats.innerCirclePower,
      quality_follower_ratio: stats.qualityFollowerRatio,
      last_scored_at: new Date().toISOString(),
    })
    .eq('id', projectId);

  if (error) {
    log(`Error updating project stats for ${projectId}:`, error.message);
  }
}

/**
 * Update competitor relationships
 */
async function updateCompetitors(
  supabase: SupabaseClient,
  projectId: string,
  competitors: { competitorId: string; commonCount: number; commonPower: number; similarity: number }[]
): Promise<void> {
  // Clear existing competitors for this project
  await supabase
    .from('project_competitors')
    .delete()
    .eq('project_id', projectId);

  if (competitors.length === 0) return;

  const insertData = competitors.map(c => ({
    project_id: projectId,
    competitor_id: c.competitorId,
    common_inner_circle_count: c.commonCount,
    common_inner_circle_power: c.commonPower,
    similarity_score: c.similarity,
    computed_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('project_competitors')
    .insert(insertData);

  if (error) {
    log(`Error inserting competitors for ${projectId}:`, error.message);
  }
}

// =============================================================================
// AUTO-DISCOVERY
// =============================================================================

/**
 * Auto-discover Twitter username for a project that doesn't have one.
 * Searches by project name, slug, and picks the best match.
 * 
 * IMPORTANT: twitter_username is an admin-controlled field.
 * Never overwrite a non-empty value. Auto-discovery only runs if empty.
 */
async function autoDiscoverTwitterUsername(
  supabase: SupabaseClient,
  project: DbProject
): Promise<string | null> {
  // IMPORTANT: twitter_username is an admin-controlled field.
  // Never overwrite a non-empty value. Auto-discovery only runs if empty.
  if (project.twitter_username && project.twitter_username.trim() !== '') {
    log(`  ℹ️ twitter_username already set to @${project.twitter_username}, using existing value`);
    return project.twitter_username;
  }

  log(`  Auto-discovering Twitter username for ${project.name}...`);

  try {
    // Search candidates
    const searchQueries = [project.name, project.slug];
    const allCandidates: UnifiedUserProfile[] = [];

    for (const query of searchQueries) {
      try {
        const results = await unifiedSearchUsers(query, 5);
        allCandidates.push(...results);
        await sleep(500);
      } catch (e: any) {
        log(`    Search for "${query}" failed: ${e.message}`);
      }
    }

    if (allCandidates.length === 0) {
      log(`    No candidates found for ${project.name} - set twitter_username manually in Supabase`);
      return null;
    }

    // Deduplicate by username
    const uniqueCandidates = Array.from(
      new Map(allCandidates.map(c => [c.username.toLowerCase(), c])).values()
    );

    // Find best match:
    // 1. Exact name match (case-insensitive)
    // 2. Highest follower count
    const exactMatch = uniqueCandidates.find(
      c => c.name?.toLowerCase() === project.name.toLowerCase() ||
           c.username.toLowerCase() === project.slug.toLowerCase()
    );

    const bestCandidate = exactMatch || 
      uniqueCandidates.sort((a, b) => b.followers - a.followers)[0];

    if (bestCandidate) {
      // IMPORTANT: Only write to twitter_username if it was empty.
      // This is a one-time discovery. After this, admin controls the value.
      const { error } = await supabase
        .from('projects')
        .update({ twitter_username: bestCandidate.username })
        .eq('id', project.id)
        .is('twitter_username', null); // Only update if still NULL

      if (error) {
        log(`    Failed to update twitter_username: ${error.message}`);
        return null;
      }

      log(`    ✓ Auto-discovered twitter_username for ${project.slug}: @${bestCandidate.username}`);
      return bestCandidate.username;
    }
  } catch (error: any) {
    log(`    Auto-discovery error: ${error.message}`);
  }

  return null;
}

/**
 * Get the Twitter handle for a project, with auto-discovery fallback.
 * 
 * IMPORTANT: twitter_username is an admin-controlled field.
 * We use existing value if set, only auto-discover if NULL/empty.
 */
async function getProjectTwitterHandle(
  supabase: SupabaseClient,
  project: DbProject
): Promise<string | null> {
  // IMPORTANT: twitter_username is an admin-controlled field.
  // Always use existing handle if set.
  const existingHandle = project.twitter_username?.trim();
  if (existingHandle) {
    return existingHandle;
  }

  // Only try auto-discovery if handle is empty
  const discovered = await autoDiscoverTwitterUsername(supabase, project);
  return discovered;
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Step 1: Discover and add new profiles from project followers and mentions
 */
async function discoverNewProfiles(
  supabase: SupabaseClient,
  projects: DbProject[]
): Promise<number> {
  log('=== Step 1: Discovering new profiles ===');
  let discovered = 0;

  for (const project of projects) {
    log(`Discovering profiles for ${project.name}...`);
    
    try {
      // Get the Twitter handle (with auto-discovery if needed)
      const handle = await getProjectTwitterHandle(supabase, project);
      
      if (!handle) {
        log(`  ⚠️ No twitter_username for ${project.name}, skipping`);
        continue;
      }

      // Get followers sample
      const followers = await unifiedGetUserFollowers(handle, MAX_FOLLOWERS_TO_SAMPLE);
      
      for (const follower of followers) {
        // Check if profile exists
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', follower.username)
          .single();

        if (!existing) {
          // Add new profile (without scores for now)
          const profileId = await upsertProfile(supabase, follower, null);
          if (profileId) {
            discovered++;
            log(`  Discovered: @${follower.username} (${follower.followers} followers)`);
          }
        }
      }

      await sleep(DELAY_BETWEEN_PROJECTS_MS);
    } catch (error: any) {
      log(`Error discovering profiles for ${project.name}:`, error.message);
    }
  }

  log(`Total new profiles discovered: ${discovered}`);
  return discovered;
}

/**
 * Step 2: Score profiles that need scoring
 */
async function scoreProfiles(supabase: SupabaseClient): Promise<number> {
  log('=== Step 2: Scoring profiles ===');
  
  const profilesToScore = await getProfilesToScore(supabase, MAX_PROFILES_PER_RUN);
  log(`Found ${profilesToScore.length} profiles to score`);

  let scored = 0;

  for (const profile of profilesToScore) {
    try {
      log(`Scoring @${profile.username}...`);
      
      const scores = await scoreProfile(profile.username);
      
      if (scores) {
        // Get fresh user info
        const user = await unifiedGetUserInfo(profile.username);
        
        if (user) {
          await upsertProfile(supabase, user, scores);
          scored++;
          
          log(`  ✓ @${profile.username}: AKARI=${scores.akariProfileScore}, Auth=${scores.authenticityScore}, Inf=${scores.influenceScore}, Signal=${scores.signalDensityScore}, Farm=${scores.farmRiskScore}`);
        }
      } else {
        log(`  ✗ Failed to score @${profile.username}`);
      }

      await sleep(DELAY_BETWEEN_PROFILES_MS);
    } catch (error: any) {
      log(`Error scoring @${profile.username}:`, error.message);
    }
  }

  log(`Total profiles scored: ${scored}`);
  return scored;
}

/**
 * Step 3: Build Global Inner Circle
 */
async function buildGlobalInnerCircle(supabase: SupabaseClient): Promise<number> {
  log('=== Step 3: Building Global Inner Circle ===');
  
  const scoredProfiles = await getScoredProfiles(supabase);
  log(`Total scored profiles: ${scoredProfiles.length}`);

  // Filter for inner circle qualification
  const qualified = scoredProfiles.filter(p => 
    qualifiesForGlobalInnerCircle({
      akariProfileScore: p.akari_profile_score,
      influenceScore: p.influence_score,
      authenticityScore: p.authenticity_score,
      signalDensityScore: p.signal_density_score,
    })
  );

  log(`Profiles qualifying for Inner Circle: ${qualified.length}`);

  // Sort by influence and take top N
  const topMembers = qualified
    .sort((a, b) => (b.influence_score || 0) - (a.influence_score || 0))
    .slice(0, GLOBAL_INNER_CIRCLE_MAX_SIZE)
    .map(p => ({
      profileId: p.id,
      akariScore: p.akari_profile_score || 0,
      influenceScore: p.influence_score || 0,
      segment: segmentProfile(p.bio || ''),
    }));

  const count = await updateGlobalInnerCircle(supabase, topMembers);
  log(`Global Inner Circle updated with ${count} members`);
  
  return count;
}

/**
 * Step 4: Build Project Inner Circles
 */
async function buildProjectInnerCircles(
  supabase: SupabaseClient,
  projects: DbProject[]
): Promise<void> {
  log('=== Step 4: Building Project Inner Circles ===');

  // Get all inner circle members with their profile data
  const { data: innerCircleData } = await supabase
    .from('inner_circle_members')
    .select(`
      profile_id,
      akari_profile_score,
      influence_score,
      profiles!inner (username, profile_image_url, name)
    `);

  const innerCircleProfiles = new Map<string, {
    profileId: string;
    username: string;
    akariScore: number;
    influenceScore: number;
  }>();

  (innerCircleData || []).forEach((m: any) => {
    if (m.profiles) {
      innerCircleProfiles.set(m.profiles.username.toLowerCase(), {
        profileId: m.profile_id,
        username: m.profiles.username,
        akariScore: m.akari_profile_score || 0,
        influenceScore: m.influence_score || 0,
      });
    }
  });

  log(`Inner circle profiles loaded: ${innerCircleProfiles.size}`);

  // Store project circle sets for competitor analysis
  const projectCircleSets = new Map<string, {
    projectId: string;
    slug: string;
    name: string;
    members: Set<string>;
  }>();

  for (const project of projects) {
    log(`Building inner circle for ${project.name}...`);
    
    const members: { profileId: string; isFollower: boolean; isAuthor: boolean; weight: number }[] = [];
    const memberIds = new Set<string>();
    let totalInfluence = 0;

    try {
      // Get the Twitter handle (with auto-discovery if needed)
      const handle = await getProjectTwitterHandle(supabase, project);
      
      if (!handle) {
        log(`  ⚠️ No twitter_username for ${project.name}, skipping`);
        continue;
      }

      // Find followers who are in inner circle
      const followers = await unifiedGetUserFollowers(handle, 100);
      for (const follower of followers) {
        const key = follower.username.toLowerCase();
        const icProfile = innerCircleProfiles.get(key);
        
        if (icProfile && !memberIds.has(icProfile.profileId)) {
          const weight = computeProjectCircleWeight(
            icProfile.akariScore,
            true,  // is follower
            false, // is author (check below)
            0      // days since interaction
          );
          
          members.push({
            profileId: icProfile.profileId,
            isFollower: true,
            isAuthor: false,
            weight,
          });
          memberIds.add(icProfile.profileId);
          totalInfluence += icProfile.influenceScore;
        }
      }

      // Find authors who tweeted about the project
      const searchQuery = `@${handle} OR "${project.name}"`;
      const tweets = await unifiedAdvancedSearchTweets(searchQuery, 'Latest', 50);
      
      for (const tweet of tweets) {
        const key = tweet.authorUsername.toLowerCase();
        const icProfile = innerCircleProfiles.get(key);
        
        if (icProfile) {
          const existingIdx = members.findIndex(m => m.profileId === icProfile.profileId);
          
          if (existingIdx >= 0) {
            // Already a follower, mark as author too
            members[existingIdx].isAuthor = true;
            members[existingIdx].weight = computeProjectCircleWeight(
              icProfile.akariScore,
              members[existingIdx].isFollower,
              true,
              0
            );
          } else if (!memberIds.has(icProfile.profileId)) {
            // New author
            const weight = computeProjectCircleWeight(
              icProfile.akariScore,
              false,
              true,
              0
            );
            
            members.push({
              profileId: icProfile.profileId,
              isFollower: false,
              isAuthor: true,
              weight,
            });
            memberIds.add(icProfile.profileId);
            totalInfluence += icProfile.influenceScore;
          }
        }
      }

      // Update project inner circle
      const count = await updateProjectInnerCircle(supabase, project.id, members);
      
      // Calculate quality follower ratio from sampled followers
      const qualityFollowers = followers.filter(f => f.followers >= 200 || f.isVerified);
      const qualityRatio = followers.length > 0 ? qualityFollowers.length / followers.length : 0;

      // Update project stats
      await updateProjectStats(supabase, project.id, {
        innerCircleCount: count,
        innerCirclePower: totalInfluence,
        qualityFollowerRatio: Math.round(qualityRatio * 10000) / 10000,
      });

      // Store for competitor analysis
      projectCircleSets.set(project.id, {
        projectId: project.id,
        slug: project.slug,
        name: project.name,
        members: memberIds,
      });

      log(`  ✓ ${project.name}: ${count} inner circle members, power=${totalInfluence}`);

      await sleep(DELAY_BETWEEN_PROJECTS_MS);
    } catch (error: any) {
      log(`Error building inner circle for ${project.name}:`, error.message);
    }
  }

  // Step 5: Compute competitor relationships
  log('=== Step 5: Computing competitor relationships ===');
  
  // Get all profiles for power calculation
  const allProfiles = new Map<string, InnerCircleMember>();
  (innerCircleData || []).forEach((m: any) => {
    if (m.profiles) {
      allProfiles.set(m.profile_id, {
        profileId: m.profile_id,
        username: m.profiles.username,
        name: m.profiles.name || m.profiles.username,
        profileImageUrl: m.profiles.profile_image_url || '',
        akariProfileScore: m.akari_profile_score || 0,
        influenceScore: m.influence_score || 0,
      });
    }
  });

  for (const [projectId, projectData] of projectCircleSets) {
    const competitors: { competitorId: string; commonCount: number; commonPower: number; similarity: number }[] = [];

    for (const [otherId, otherData] of projectCircleSets) {
      if (projectId === otherId) continue;

      const common = computeCommonInnerCircle(
        projectData.members,
        otherData.members,
        allProfiles
      );

      if (common.commonCount > 0) {
        competitors.push({
          competitorId: otherId,
          commonCount: common.commonCount,
          commonPower: common.commonPower,
          similarity: common.similarityScore,
        });
      }
    }

    // Sort by similarity and keep top 5
    competitors.sort((a, b) => b.similarity - a.similarity);
    await updateCompetitors(supabase, projectId, competitors.slice(0, 5));

    if (competitors.length > 0) {
      log(`  ${projectData.name}: ${competitors.length} similar projects found`);
    }
  }
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

async function main() {
  log('========================================');
  log('AKARI Circles Update Script');
  log('========================================');

  // Validate environment
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  // Create Supabase client with service role
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Get active projects
  const projects = await getActiveProjects(supabase);
  log(`Found ${projects.length} active projects`);

  if (projects.length === 0) {
    log('No active projects found. Exiting.');
    return;
  }

  // Run update steps
  const stats = {
    discovered: 0,
    scored: 0,
    globalCircleSize: 0,
  };

  try {
    // Step 1: Discover new profiles
    stats.discovered = await discoverNewProfiles(supabase, projects);

    // Step 2: Score profiles
    stats.scored = await scoreProfiles(supabase);

    // Step 3: Build Global Inner Circle
    stats.globalCircleSize = await buildGlobalInnerCircle(supabase);

    // Step 4 & 5: Build Project Inner Circles and Competitors
    await buildProjectInnerCircles(supabase, projects);

  } catch (error: any) {
    log('Fatal error:', error.message);
    throw error;
  }

  // Summary
  log('========================================');
  log('SUMMARY');
  log('========================================');
  log(`New profiles discovered: ${stats.discovered}`);
  log(`Profiles scored: ${stats.scored}`);
  log(`Global Inner Circle size: ${stats.globalCircleSize}`);
  log(`Projects processed: ${projects.length}`);
  log('========================================');
  log('Circles update complete!');
}

// Run the script
main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});

