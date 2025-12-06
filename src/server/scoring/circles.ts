/**
 * Circles Logic Module
 * 
 * Implements:
 * - Global Inner Circle: Top CT profiles based on AKARI scores
 * - Project Inner Circle: Profiles that engage with specific projects
 * - Common Inner Circle: Overlap between projects for competitor analysis
 */

// =============================================================================
// TYPES
// =============================================================================

export interface InnerCircleMember {
  profileId: string;
  username: string;
  name: string;
  profileImageUrl: string;
  akariProfileScore: number;
  influenceScore: number;
  segment?: string;
}

export interface ProjectInnerCircleMember extends InnerCircleMember {
  isFollower: boolean;
  isAuthor: boolean;
  weight: number;
}

export interface CommonCircleResult {
  commonCount: number;
  commonPower: number;
  similarityScore: number;
  commonMembers: InnerCircleMember[];
}

export interface CompetitorInfo {
  projectId: string;
  slug: string;
  name: string;
  akariProjectScore: number | null;
  commonInnerCircleCount: number;
  commonInnerCirclePower: number;
  similarityScore: number;
}

// =============================================================================
// GLOBAL INNER CIRCLE CRITERIA
// =============================================================================

/**
 * Criteria for a profile to be in the Global Inner Circle
 */
export const GLOBAL_INNER_CIRCLE_CRITERIA = {
  minAkariProfileScore: 750,
  minInfluenceScore: 70,
  minAuthenticityScore: 60,
  minSignalDensityScore: 60,
};

/**
 * Maximum size of the Global Inner Circle
 */
export const GLOBAL_INNER_CIRCLE_MAX_SIZE = 2000;

// =============================================================================
// GLOBAL INNER CIRCLE
// =============================================================================

/**
 * Check if a profile qualifies for the Global Inner Circle
 */
export function qualifiesForGlobalInnerCircle(profile: {
  akariProfileScore: number | null;
  influenceScore: number | null;
  authenticityScore: number | null;
  signalDensityScore: number | null;
}): boolean {
  return (
    (profile.akariProfileScore ?? 0) >= GLOBAL_INNER_CIRCLE_CRITERIA.minAkariProfileScore &&
    (profile.influenceScore ?? 0) >= GLOBAL_INNER_CIRCLE_CRITERIA.minInfluenceScore &&
    (profile.authenticityScore ?? 0) >= GLOBAL_INNER_CIRCLE_CRITERIA.minAuthenticityScore &&
    (profile.signalDensityScore ?? 0) >= GLOBAL_INNER_CIRCLE_CRITERIA.minSignalDensityScore
  );
}

/**
 * Rank profiles for Global Inner Circle membership
 * Returns profiles sorted by influence score descending
 */
export function rankForGlobalInnerCircle(
  profiles: {
    profileId: string;
    username: string;
    name: string;
    profileImageUrl: string;
    akariProfileScore: number;
    influenceScore: number;
    authenticityScore: number;
    signalDensityScore: number;
    segment?: string;
  }[]
): InnerCircleMember[] {
  return profiles
    .filter(p => qualifiesForGlobalInnerCircle(p))
    .sort((a, b) => b.influenceScore - a.influenceScore)
    .slice(0, GLOBAL_INNER_CIRCLE_MAX_SIZE)
    .map(p => ({
      profileId: p.profileId,
      username: p.username,
      name: p.name,
      profileImageUrl: p.profileImageUrl,
      akariProfileScore: p.akariProfileScore,
      influenceScore: p.influenceScore,
      segment: p.segment,
    }));
}

// =============================================================================
// PROJECT INNER CIRCLE
// =============================================================================

/**
 * Compute weight for a profile in a project's inner circle
 * 
 * Weight is based on:
 * - Profile's AKARI score (higher = more weight)
 * - Engagement type (author > follower)
 * - Recency of interaction
 */
export function computeProjectCircleWeight(
  akariProfileScore: number,
  isFollower: boolean,
  isAuthor: boolean,
  daysSinceInteraction: number
): number {
  let weight = akariProfileScore / 1000; // Base weight from score (0-1)
  
  // Author bonus (+50% weight)
  if (isAuthor) {
    weight *= 1.5;
  }
  
  // Follower bonus (+25% weight)
  if (isFollower) {
    weight *= 1.25;
  }
  
  // Recency decay (halve weight for each 30 days since last interaction)
  const decayFactor = Math.pow(0.5, daysSinceInteraction / 30);
  weight *= decayFactor;
  
  return Math.round(weight * 10000) / 10000; // 4 decimal precision
}

/**
 * Calculate project inner circle metrics
 */
export function calculateProjectInnerCircleMetrics(
  members: ProjectInnerCircleMember[]
): {
  count: number;
  power: number;
  avgScore: number;
} {
  const count = members.length;
  const power = members.reduce((sum, m) => sum + m.influenceScore, 0);
  const avgScore = count > 0 
    ? Math.round(members.reduce((sum, m) => sum + m.akariProfileScore, 0) / count)
    : 0;
  
  return { count, power, avgScore };
}

// =============================================================================
// COMMON CIRCLES / COMPETITOR ANALYSIS
// =============================================================================

/**
 * Compute common inner circle between two projects
 */
export function computeCommonInnerCircle(
  projectAMembers: Set<string>,  // Set of profile IDs
  projectBMembers: Set<string>,
  allProfiles: Map<string, InnerCircleMember>  // Map of profile ID to member data
): CommonCircleResult {
  // Compute intersection
  const commonIds = new Set<string>();
  for (const id of projectAMembers) {
    if (projectBMembers.has(id)) {
      commonIds.add(id);
    }
  }
  
  // Compute union
  const unionIds = new Set([...projectAMembers, ...projectBMembers]);
  
  // Get common members with their data
  const commonMembers: InnerCircleMember[] = [];
  let commonPower = 0;
  
  for (const id of commonIds) {
    const member = allProfiles.get(id);
    if (member) {
      commonMembers.push(member);
      commonPower += member.influenceScore;
    }
  }
  
  // Compute similarity score (Jaccard index)
  const similarityScore = unionIds.size > 0 
    ? commonIds.size / unionIds.size 
    : 0;
  
  return {
    commonCount: commonIds.size,
    commonPower,
    similarityScore: Math.round(similarityScore * 10000) / 10000,
    commonMembers,
  };
}

/**
 * Find top competitors for a project based on inner circle overlap
 */
export function findTopCompetitors(
  projectId: string,
  projectMembers: Set<string>,
  allProjectsMembers: Map<string, {
    projectId: string;
    slug: string;
    name: string;
    akariProjectScore: number | null;
    members: Set<string>;
  }>,
  allProfiles: Map<string, InnerCircleMember>,
  limit: number = 5
): CompetitorInfo[] {
  const competitors: CompetitorInfo[] = [];
  
  for (const [otherId, otherProject] of allProjectsMembers) {
    if (otherId === projectId) continue;
    
    const common = computeCommonInnerCircle(
      projectMembers,
      otherProject.members,
      allProfiles
    );
    
    if (common.commonCount > 0) {
      competitors.push({
        projectId: otherProject.projectId,
        slug: otherProject.slug,
        name: otherProject.name,
        akariProjectScore: otherProject.akariProjectScore,
        commonInnerCircleCount: common.commonCount,
        commonInnerCirclePower: common.commonPower,
        similarityScore: common.similarityScore,
      });
    }
  }
  
  // Sort by similarity score descending
  competitors.sort((a, b) => b.similarityScore - a.similarityScore);
  
  return competitors.slice(0, limit);
}

/**
 * Segment profiles into categories based on their content
 */
export function segmentProfile(
  bio: string,
  recentTweetTopics?: string[]
): string {
  const bioLower = bio.toLowerCase();
  const topics = (recentTweetTopics || []).map(t => t.toLowerCase());
  const combined = bioLower + ' ' + topics.join(' ');
  
  // Check for segment keywords
  if (/defi|dex|amm|yield|lending|borrowing/.test(combined)) {
    return 'defi';
  }
  if (/nft|pfp|art|collection|mint/.test(combined)) {
    return 'nft';
  }
  if (/game|gaming|play2earn|p2e|gamefi/.test(combined)) {
    return 'gaming';
  }
  if (/infra|infrastructure|layer|rollup|chain|protocol/.test(combined)) {
    return 'infrastructure';
  }
  if (/ai|machine learning|ml|artificial/.test(combined)) {
    return 'ai';
  }
  if (/vc|investor|fund|capital/.test(combined)) {
    return 'investor';
  }
  if (/builder|dev|engineer|developer/.test(combined)) {
    return 'builder';
  }
  
  return 'general';
}

// =============================================================================
// DATABASE-LEVEL HELPER FUNCTIONS
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Get the set of profile IDs from project_inner_circle for a project
 */
export async function getProjectInnerCircleProfileIds(
  supabase: SupabaseClient,
  projectId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('project_inner_circle')
    .select('profile_id')
    .eq('project_id', projectId);

  if (error) {
    console.error('[circles] Error fetching inner circle:', error.message);
    return new Set();
  }

  return new Set((data || []).map(row => row.profile_id));
}

/**
 * Compute similarity between two projects based on inner circle overlap
 */
export async function computeProjectSimilarity(
  supabase: SupabaseClient,
  aProjectId: string,
  bProjectId: string
): Promise<{
  common_inner_circle_count: number;
  inner_circle_overlap: number;
}> {
  // Load both sets
  const [aSet, bSet] = await Promise.all([
    getProjectInnerCircleProfileIds(supabase, aProjectId),
    getProjectInnerCircleProfileIds(supabase, bProjectId),
  ]);

  // Compute intersection
  const common = [...aSet].filter(id => bSet.has(id)).length;
  
  // Compute union
  const union = new Set([...aSet, ...bSet]).size;
  
  // Compute overlap (Jaccard index)
  const inner_circle_overlap = union === 0 ? 0 : common / union;

  return {
    common_inner_circle_count: common,
    inner_circle_overlap: Math.round(inner_circle_overlap * 10000) / 10000,
  };
}

/**
 * Find nearest competitors for a project based on inner circle overlap
 */
export async function findNearestCompetitors(
  supabase: SupabaseClient,
  projectId: string,
  limit: number = 5
): Promise<CompetitorInfo[]> {
  // Get all other projects
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, slug, name')
    .eq('is_active', true)
    .neq('id', projectId);

  if (projectsError || !projects) {
    console.error('[circles] Error fetching projects:', projectsError?.message);
    return [];
  }

  // Get this project's inner circle
  const thisCircle = await getProjectInnerCircleProfileIds(supabase, projectId);
  
  if (thisCircle.size === 0) {
    return [];
  }

  // Compute similarity for each project
  const competitors: CompetitorInfo[] = [];

  for (const otherProject of projects) {
    const otherCircle = await getProjectInnerCircleProfileIds(supabase, otherProject.id);
    
    if (otherCircle.size === 0) continue;

    // Compute overlap
    const common = [...thisCircle].filter(id => otherCircle.has(id)).length;
    const union = new Set([...thisCircle, ...otherCircle]).size;
    const similarity = union === 0 ? 0 : common / union;

    if (common > 0) {
      // Get latest AKARI score
      const { data: metrics } = await supabase
        .from('metrics_daily')
        .select('akari_score')
        .eq('project_id', otherProject.id)
        .order('date', { ascending: false })
        .limit(1)
        .single();

      competitors.push({
        projectId: otherProject.id,
        slug: otherProject.slug,
        name: otherProject.name,
        akariProjectScore: metrics?.akari_score || null,
        commonInnerCircleCount: common,
        commonInnerCirclePower: 0, // Can be computed if needed
        similarityScore: Math.round(similarity * 10000) / 10000,
      });
    }
  }

  // Sort by similarity descending
  competitors.sort((a, b) => b.similarityScore - a.similarityScore);

  return competitors.slice(0, limit);
}

