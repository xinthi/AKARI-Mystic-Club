/**
 * Supabase Client Helper for Portal Sentiment Features
 * 
 * This module provides a Supabase client for querying sentiment data.
 * For portal pages (read-only), use the anon key.
 * For background scripts (write access), use the service role key.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// ENVIRONMENT VARIABLES
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Project table row
 */
export interface Project {
  id: string;
  slug: string;
  x_handle: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  twitter_profile_image_url: string | null;
  first_tracked_at: string | null;
  last_refreshed_at: string | null;
  is_active: boolean;
}

/**
 * Metrics daily table row
 */
export interface MetricsDaily {
  id: string;
  project_id: string;
  date: string;
  sentiment_score: number | null;
  ct_heat_score: number | null;
  tweet_count: number | null;
  followers: number | null;
  akari_score: number | null;
  created_at: string;
}

/**
 * Influencer table row
 */
export interface Influencer {
  id: string;
  x_handle: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  followers: number | null;
  following: number | null;
  akari_score: number | null;
  credibility_score: number | null;
  last_updated_at: string | null;
}

/**
 * Project influencer relationship
 */
export interface ProjectInfluencer {
  id: string;
  project_id: string;
  influencer_id: string;
  is_follower: boolean;
  last_mention_at: string | null;
  avg_sentiment_30d: number | null;
}

/**
 * Project tweet row
 */
export interface ProjectTweet {
  id: string;
  project_id: string;
  tweet_id: string;
  author_handle: string;
  created_at: string;
  text: string | null;
  likes: number | null;
  replies: number | null;
  retweets: number | null;
  sentiment_score: number | null;
}

/**
 * Direction indicator for 24h changes
 */
export type ChangeDirection = 'up' | 'down' | 'flat';

/**
 * 24h change data for metrics
 */
export interface MetricsChange24h {
  sentimentChange24h: number;
  ctHeatChange24h: number;
  akariChange24h: number;
  sentimentDirection24h: ChangeDirection;
  ctHeatDirection24h: ChangeDirection;
}

/**
 * Combined project with latest metrics for overview
 */
export interface ProjectWithMetrics extends Project, MetricsChange24h {
  sentiment_score: number | null;
  ct_heat_score: number | null;
  akari_score: number | null;
  followers: number | null;
  date: string | null;
}

/**
 * Top mover entry for the overview page
 */
export interface TopMover {
  slug: string;
  name: string;
  x_handle: string;
  avatar_url: string | null;
  twitter_profile_image_url: string | null;
  akari_score: number | null;
  akariChange24h: number;
  ctHeatChange24h: number;
  sentimentChange24h: number;
  sentimentDirection24h: ChangeDirection;
  ctHeatDirection24h: ChangeDirection;
}

/**
 * Top engagement entry (highest CT Heat / engagement scores)
 */
export interface TopEngagement {
  slug: string;
  name: string;
  x_handle: string;
  avatar_url: string | null;
  twitter_profile_image_url: string | null;
  ct_heat_score: number;
  sentiment_score: number | null;
  akari_score: number | null;
}

/**
 * Trending up entry (positive sentiment momentum)
 */
export interface TrendingUp {
  slug: string;
  name: string;
  x_handle: string;
  avatar_url: string | null;
  twitter_profile_image_url: string | null;
  sentiment_score: number;
  sentimentChange24h: number;
  akari_score: number | null;
}

/**
 * Influencer with project relationship data
 */
export interface InfluencerWithRelation extends Influencer {
  avg_sentiment_30d: number | null;
  last_mention_at: string | null;
}

// =============================================================================
// CLIENT CREATION
// =============================================================================

/**
 * Create a Supabase client for read-only portal access.
 * Uses the anon key which respects Row Level Security (RLS).
 */
export function createPortalClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[Supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    throw new Error('Supabase configuration missing');
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
    },
  });
}

/**
 * Create a Supabase client with service role (admin) access.
 * Use this ONLY in backend scripts, never in frontend or API routes.
 * The service role key bypasses Row Level Security (RLS).
 */
export function createServiceClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role configuration missing');
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Compute direction from a numeric change value.
 */
export function getDirection(change: number): ChangeDirection {
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'flat';
}

/**
 * Compute 24h changes between two metrics rows.
 */
export function compute24hChanges(
  latest: MetricsDaily | null,
  previous: MetricsDaily | null
): MetricsChange24h {
  const sentimentChange24h = (latest?.sentiment_score ?? 0) - (previous?.sentiment_score ?? latest?.sentiment_score ?? 0);
  const ctHeatChange24h = (latest?.ct_heat_score ?? 0) - (previous?.ct_heat_score ?? latest?.ct_heat_score ?? 0);
  const akariChange24h = (latest?.akari_score ?? 0) - (previous?.akari_score ?? latest?.akari_score ?? 0);

  return {
    sentimentChange24h,
    ctHeatChange24h,
    akariChange24h,
    sentimentDirection24h: getDirection(sentimentChange24h),
    ctHeatDirection24h: getDirection(ctHeatChange24h),
  };
}

// =============================================================================
// QUERY HELPERS
// =============================================================================

/**
 * Get all active projects with their latest metrics and 24h changes.
 * Used for the sentiment overview page.
 */
export async function getProjectsWithLatestMetrics(
  client: SupabaseClient
): Promise<ProjectWithMetrics[]> {
  // First get all active projects
  const { data: projects, error: projectsError } = await client
    .from('projects')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (projectsError) {
    console.error('[Supabase] Error fetching projects:', projectsError);
    throw projectsError;
  }

  if (!projects || projects.length === 0) {
    return [];
  }

  // For each project, get the latest metrics
  const projectIds = projects.map((p) => p.id);

  // Get metrics ordered by date desc - we'll extract latest and previous for each project
  const { data: metrics, error: metricsError } = await client
    .from('metrics_daily')
    .select('*')
    .in('project_id', projectIds)
    .order('date', { ascending: false });

  if (metricsError) {
    console.error('[Supabase] Error fetching metrics:', metricsError);
    // Return projects without metrics rather than failing entirely
    return projects.map((p) => ({
      ...p,
      sentiment_score: null,
      ct_heat_score: null,
      akari_score: null,
      followers: null,
      date: null,
      sentimentChange24h: 0,
      ctHeatChange24h: 0,
      akariChange24h: 0,
      sentimentDirection24h: 'flat' as ChangeDirection,
      ctHeatDirection24h: 'flat' as ChangeDirection,
    }));
  }

  // Create maps of project_id -> latest metrics and previous metrics
  const latestMetricsByProject = new Map<string, MetricsDaily>();
  const previousMetricsByProject = new Map<string, MetricsDaily>();
  
  if (metrics) {
    for (const m of metrics) {
      if (!latestMetricsByProject.has(m.project_id)) {
        latestMetricsByProject.set(m.project_id, m);
      } else if (!previousMetricsByProject.has(m.project_id)) {
        // This is the second row for this project (previous day)
        previousMetricsByProject.set(m.project_id, m);
      }
    }
  }

  // Combine projects with their latest metrics and 24h changes
  return projects.map((project) => {
    const latestMetrics = latestMetricsByProject.get(project.id) ?? null;
    const previousMetrics = previousMetricsByProject.get(project.id) ?? null;
    const changes = compute24hChanges(latestMetrics, previousMetrics);

    return {
      ...project,
      sentiment_score: latestMetrics?.sentiment_score ?? null,
      ct_heat_score: latestMetrics?.ct_heat_score ?? null,
      akari_score: latestMetrics?.akari_score ?? null,
      followers: latestMetrics?.followers ?? null,
      date: latestMetrics?.date ?? null,
      ...changes,
    };
  });
}

/**
 * Compute top movers from a list of projects with metrics.
 * Sorts by max absolute change in AKARI or CT Heat.
 */
export function computeTopMovers(
  projects: ProjectWithMetrics[],
  limit: number = 3
): TopMover[] {
  // Calculate mover score for each project
  const withMoverScore = projects
    .filter(p => p.date !== null) // Only include projects with metrics
    .map(p => ({
      ...p,
      moverScore: Math.max(Math.abs(p.akariChange24h), Math.abs(p.ctHeatChange24h)),
    }));

  // Sort by mover score descending (projects with changes first, then by akari_score)
  withMoverScore.sort((a, b) => {
    if (b.moverScore !== a.moverScore) return b.moverScore - a.moverScore;
    return (b.akari_score ?? 0) - (a.akari_score ?? 0);
  });

  // Take top N and map to TopMover interface (always return up to limit, even if no changes)
  return withMoverScore.slice(0, limit).map(p => ({
    slug: p.slug,
    name: p.name,
    x_handle: p.x_handle,
    avatar_url: p.avatar_url,
    twitter_profile_image_url: p.twitter_profile_image_url,
    akari_score: p.akari_score,
    akariChange24h: p.akariChange24h,
    ctHeatChange24h: p.ctHeatChange24h,
    sentimentChange24h: p.sentimentChange24h,
    sentimentDirection24h: p.sentimentDirection24h,
    ctHeatDirection24h: p.ctHeatDirection24h,
  }));
}

/**
 * Compute top engagement projects (highest CT Heat scores)
 */
export function computeTopEngagement(
  projects: ProjectWithMetrics[],
  limit: number = 3
): TopEngagement[] {
  // FIX: Sort by CT heat score descending, with fallback to akari_score
  // Always show at least 3 projects even if CT heat is 0
  console.log(`[computeTopEngagement] Input: ${projects.length} projects, limit: ${limit}`);
  
  const sorted = [...projects]
    .filter(p => p.date !== null)
    .sort((a, b) => {
      const aHeat = a.ct_heat_score ?? 0;
      const bHeat = b.ct_heat_score ?? 0;
      if (bHeat !== aHeat) return bHeat - aHeat;
      return (b.akari_score ?? 0) - (a.akari_score ?? 0);
    });

  console.log(`[computeTopEngagement] Sorted: ${sorted.length}, returning: ${Math.min(limit, sorted.length)}`);
  
  // Always return up to limit projects
  return sorted.slice(0, limit).map(p => ({
    slug: p.slug,
    name: p.name,
    x_handle: p.x_handle,
    avatar_url: p.avatar_url,
    twitter_profile_image_url: p.twitter_profile_image_url,
    ct_heat_score: p.ct_heat_score ?? 0,
    sentiment_score: p.sentiment_score,
    akari_score: p.akari_score,
  }));
}

/**
 * Compute trending up projects (positive sentiment with upward momentum)
 * Always returns up to limit projects, prioritizing those with positive momentum
 */
export function computeTrendingUp(
  projects: ProjectWithMetrics[],
  limit: number = 3
): TrendingUp[] {
  // FIX: Sort by sentiment change descending, with fallback to sentiment score
  // Always show at least 3 projects even with negative changes
  console.log(`[computeTrendingUp] Input: ${projects.length} projects, limit: ${limit}`);
  
  const sorted = [...projects]
    .filter(p => p.date !== null)
    .sort((a, b) => {
      // First prioritize positive changes
      if (b.sentimentChange24h !== a.sentimentChange24h) {
        return b.sentimentChange24h - a.sentimentChange24h;
      }
      // Then by sentiment score
      return (b.sentiment_score ?? 0) - (a.sentiment_score ?? 0);
    });

  console.log(`[computeTrendingUp] Sorted: ${sorted.length}, returning: ${Math.min(limit, sorted.length)}`);
  
  // Always return up to limit projects
  return sorted.slice(0, limit).map(p => ({
    slug: p.slug,
    name: p.name,
    x_handle: p.x_handle,
    avatar_url: p.avatar_url,
    twitter_profile_image_url: p.twitter_profile_image_url,
    sentiment_score: p.sentiment_score ?? 0,
    sentimentChange24h: p.sentimentChange24h,
    akari_score: p.akari_score,
  }));
}

/**
 * Get a single project by slug.
 */
export async function getProjectBySlug(
  client: SupabaseClient,
  slug: string
): Promise<Project | null> {
  const { data, error } = await client
    .from('projects')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned - project not found
      return null;
    }
    console.error('[Supabase] Error fetching project:', error);
    throw error;
  }

  return data;
}

/**
 * Get metrics history for a project.
 * Returns the last N days of metrics, ordered by date descending.
 */
export async function getProjectMetricsHistory(
  client: SupabaseClient,
  projectId: string,
  limit: number = 90
): Promise<MetricsDaily[]> {
  const { data, error } = await client
    .from('metrics_daily')
    .select('*')
    .eq('project_id', projectId)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Supabase] Error fetching metrics history:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get top influencers for a project.
 * Joins project_influencers with influencers table.
 */
export async function getProjectInfluencers(
  client: SupabaseClient,
  projectId: string,
  limit: number = 10
): Promise<InfluencerWithRelation[]> {
  // Get project_influencer relationships
  const { data: relations, error: relError } = await client
    .from('project_influencers')
    .select('*')
    .eq('project_id', projectId)
    .order('avg_sentiment_30d', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (relError) {
    console.error('[Supabase] Error fetching project influencers:', relError);
    throw relError;
  }

  if (!relations || relations.length === 0) {
    return [];
  }

  // Get the influencer details
  const influencerIds = relations.map((r) => r.influencer_id);

  const { data: influencers, error: infError } = await client
    .from('influencers')
    .select('*')
    .in('id', influencerIds)
    .order('akari_score', { ascending: false, nullsFirst: false });

  if (infError) {
    console.error('[Supabase] Error fetching influencers:', infError);
    throw infError;
  }

  if (!influencers) {
    return [];
  }

  // Create a map for quick lookup
  const relationMap = new Map<string, ProjectInfluencer>();
  for (const r of relations) {
    relationMap.set(r.influencer_id, r);
  }

  // Combine influencer data with relationship data
  return influencers.map((inf) => {
    const rel = relationMap.get(inf.id);
    return {
      ...inf,
      avg_sentiment_30d: rel?.avg_sentiment_30d ?? null,
      last_mention_at: rel?.last_mention_at ?? null,
    };
  });
}

/**
 * Get recent tweets for a project.
 */
export async function getProjectTweets(
  client: SupabaseClient,
  projectId: string,
  limit: number = 50
): Promise<ProjectTweet[]> {
  const { data, error } = await client
    .from('project_tweets')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Supabase] Error fetching tweets:', error);
    throw error;
  }

  return data || [];
}

