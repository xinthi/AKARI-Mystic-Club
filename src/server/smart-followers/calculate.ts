/**
 * Smart Followers Calculation System
 * 
 * ⚠️ CONFIDENTIAL - SERVER-SIDE ONLY ⚠️
 * 
 * This module calculates Smart Followers using graph-based PageRank
 * with fallback to "Smart Audience Estimate" if graph data unavailable.
 * 
 * DO NOT import this file in any client-side/browser code.
 */

import { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

export interface SmartFollowersResult {
  smart_followers_count: number;
  smart_followers_pct: number;
  is_estimate: boolean; // true if using fallback estimate mode
}

export interface SmartAccountScore {
  x_user_id: string;
  pagerank: number;
  bot_risk: number;
  smart_score: number;
  is_smart: boolean;
}

// =============================================================================
// CONFIGURATION (from env vars - safe fallbacks)
// =============================================================================

const SMART_FOLLOWERS_TOP_N = parseInt(process.env.SMART_FOLLOWERS_TOP_N || '1000', 10);
const SMART_FOLLOWERS_TOP_PCT = parseFloat(process.env.SMART_FOLLOWERS_TOP_PCT || '0.1');
const BOT_RISK_THRESHOLD = parseFloat(process.env.BOT_RISK_THRESHOLD || '0.5');
const MIN_ACCOUNT_AGE_DAYS = parseInt(process.env.MIN_ACCOUNT_AGE_DAYS || '90', 10);

// =============================================================================
// HELPER: Calculate Bot Risk
// =============================================================================

/**
 * Calculate bot risk score (0-1, higher = more risky)
 * Uses configurable heuristics from env vars
 */
function calculateBotRisk(profile: {
  followers_count: number;
  following_count: number;
  account_created_at: string | null;
}): number {
  let risk = 0;

  // Account age check
  if (profile.account_created_at) {
    const ageDays = (Date.now() - new Date(profile.account_created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < MIN_ACCOUNT_AGE_DAYS) {
      risk += 0.3;
    }
  } else {
    risk += 0.2; // Unknown age = risk
  }

  // Followers/following ratio check
  if (profile.following_count > 0) {
    const ratio = profile.followers_count / profile.following_count;
    if (ratio < 0.1) {
      risk += 0.4; // Following way more than followers
    } else if (ratio < 0.5) {
      risk += 0.2;
    }
  } else if (profile.followers_count === 0) {
    risk += 0.3; // No followers = suspicious
  }

  // Follower count sanity check
  if (profile.followers_count > 0 && profile.followers_count < 10) {
    risk += 0.2; // Very few followers
  }

  return Math.min(1, risk);
}

// =============================================================================
// FALLBACK: Smart Audience Estimate
// =============================================================================

/**
 * Fallback method: Estimate Smart Followers using high-trust engagers
 * This is used when graph data is not available
 */
async function calculateSmartAudienceEstimate(
  supabase: SupabaseClient,
  entityType: 'project' | 'creator',
  entityId: string
): Promise<SmartFollowersResult> {
  // For projects: get high-engagement authors from project_tweets
  // For creators: get high-engagement interactions from user_ct_activity
  
  let highTrustEngagers: string[] = [];

  if (entityType === 'project') {
    // Get authors with high engagement in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: tweets } = await supabase
      .from('project_tweets')
      .select('author_handle, likes, replies, retweets')
      .eq('project_id', entityId)
      .eq('is_official', false)
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (tweets) {
      // Aggregate engagement per author
      const authorEngagement = new Map<string, number>();
      for (const tweet of tweets) {
        const username = tweet.author_handle?.toLowerCase().replace('@', '');
        if (!username) continue;
        
        const engagement = (tweet.likes || 0) + (tweet.replies || 0) * 2 + (tweet.retweets || 0) * 3;
        const current = authorEngagement.get(username) || 0;
        authorEngagement.set(username, current + engagement);
      }

      // Filter: high engagement (top 20% or >100 engagement points)
      const sorted = Array.from(authorEngagement.entries())
        .sort((a, b) => b[1] - a[1]);
      
      const threshold = Math.max(100, sorted[Math.floor(sorted.length * 0.2)]?.[1] || 0);
      highTrustEngagers = sorted
        .filter(([_, engagement]) => engagement >= threshold)
        .map(([username]) => username);
    }
  } else {
    // For creators: similar logic using user_ct_activity
    // TODO: Implement if needed
  }

  return {
    smart_followers_count: highTrustEngagers.length,
    smart_followers_pct: 0, // Can't calculate pct without total followers
    is_estimate: true,
  };
}

// =============================================================================
// MAIN: Get Smart Followers
// =============================================================================

/**
 * Get Smart Followers count and percentage for an entity
 * 
 * @param supabase - Supabase client
 * @param entityType - 'project' or 'creator'
 * @param entityId - Project ID (UUID) or creator x_user_id (TEXT)
 * @param xUserId - The X user ID to measure (for creators, same as entityId)
 * @param asOfDate - Date to use for snapshot (defaults to today)
 * @returns Smart Followers result
 */
export async function getSmartFollowers(
  supabase: SupabaseClient,
  entityType: 'project' | 'creator',
  entityId: string,
  xUserId: string,
  asOfDate: Date = new Date()
): Promise<SmartFollowersResult> {
  const dateStr = asOfDate.toISOString().split('T')[0];

  // Try to get from snapshot first
  const { data: snapshot } = await supabase
    .from('smart_followers_snapshots')
    .select('smart_followers_count, smart_followers_pct, is_estimate')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('x_user_id', xUserId)
    .eq('as_of_date', dateStr)
    .maybeSingle();

  if (snapshot) {
    return {
      smart_followers_count: snapshot.smart_followers_count || 0,
      smart_followers_pct: Number(snapshot.smart_followers_pct || 0),
      is_estimate: snapshot.is_estimate || false,
    };
  }

  // No snapshot found - try to calculate from graph
  // Check if we have graph data
  const { data: graphCheck } = await supabase
    .from('x_follow_edges')
    .select('src_user_id')
    .eq('dst_user_id', xUserId)
    .limit(1)
    .maybeSingle();

  if (graphCheck) {
    // We have graph data - use it
    // First get list of smart account IDs
    const { data: smartAccounts } = await supabase
      .from('smart_account_scores')
      .select('x_user_id')
      .eq('as_of_date', dateStr)
      .eq('is_smart', true);

    const smartAccountIds = smartAccounts?.map(a => a.x_user_id) || [];

    if (smartAccountIds.length > 0) {
      const { data: smartEdges } = await supabase
        .from('x_follow_edges')
        .select('src_user_id')
        .eq('dst_user_id', xUserId)
        .in('src_user_id', smartAccountIds);

      const count = smartEdges?.length || 0;

    // Get total followers for percentage
    const { data: profile } = await supabase
      .from('tracked_profiles')
      .select('followers_count')
      .eq('x_user_id', xUserId)
      .maybeSingle();

    const totalFollowers = profile?.followers_count || 0;
    const pct = totalFollowers > 0 
      ? (count / totalFollowers) * 100 
      : 0;

      return {
        smart_followers_count: count,
        smart_followers_pct: Math.min(100, Math.max(0, pct)),
        is_estimate: false,
      };
    }
  }

  // No graph data - use fallback estimate
  return calculateSmartAudienceEstimate(supabase, entityType, entityId);
}

// =============================================================================
// DELTA CALCULATION
// =============================================================================

/**
 * Calculate Smart Followers deltas (7d and 30d changes)
 */
export async function getSmartFollowersDeltas(
  supabase: SupabaseClient,
  entityType: 'project' | 'creator',
  entityId: string,
  xUserId: string
): Promise<{
  delta_7d: number;
  delta_30d: number;
}> {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const todayStr = today.toISOString().split('T')[0];
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  // Get current count
  const current = await getSmartFollowers(supabase, entityType, entityId, xUserId, today);
  const currentCount = current.smart_followers_count;

  // Get 7d ago count
  const sevenDaysAgoResult = await getSmartFollowers(supabase, entityType, entityId, xUserId, sevenDaysAgo);
  const sevenDaysAgoCount = sevenDaysAgoResult.smart_followers_count;

  // Get 30d ago count
  const thirtyDaysAgoResult = await getSmartFollowers(supabase, entityType, entityId, xUserId, thirtyDaysAgo);
  const thirtyDaysAgoCount = thirtyDaysAgoResult.smart_followers_count;

  return {
    delta_7d: currentCount - sevenDaysAgoCount,
    delta_30d: currentCount - thirtyDaysAgoCount,
  };
}

