/**
 * Project Mindshare Calculation (BPS Normalized)
 * 
 * ⚠️ CONFIDENTIAL - SERVER-SIDE ONLY ⚠️
 * 
 * This module calculates project mindshare normalized to 10,000 basis points (bps)
 * per time window (24h, 48h, 7d, 30d).
 * 
 * DO NOT import this file in any client-side/browser code.
 */

import { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

export type MindshareWindow = '24h' | '48h' | '7d' | '30d';

export interface MindshareResult {
  mindshare_bps: number; // 0-10000 (normalized)
  delta_bps_1d: number | null;
  delta_bps_7d: number | null;
  attention_value: number; // Raw attention value before normalization
}

export interface ProjectMindshareInputs {
  projectId: string;
  window: MindshareWindow;
  postsOrMentions: number;
  uniqueCreators: number;
  engagementTotal: number;
  ctHeatNorm: number; // Normalized CT Heat (0-100)
  creatorOrganicScore: number; // 0-100
  audienceOrganicScore: number; // 0-100
  originalityScore: number; // 0-100
  sentimentMultiplier: number; // 0-2 (typically 0.8-1.2)
  smartFollowersBoost: number; // 0-2 (typically 1.0-1.5)
  keywordMatchStrength: number; // 0-1 (match strength multiplier)
}

// =============================================================================
// CONFIGURATION (from env vars - safe fallbacks)
// =============================================================================

// Core weights (log-scaled inputs)
const W1_POSTS = parseFloat(process.env.MINDSHARE_W1_POSTS || '0.25');
const W2_CREATORS = parseFloat(process.env.MINDSHARE_W2_CREATORS || '0.25');
const W3_ENGAGEMENT = parseFloat(process.env.MINDSHARE_W3_ENGAGEMENT || '0.30');
const W4_CT_HEAT = parseFloat(process.env.MINDSHARE_W4_CT_HEAT || '0.20');

// Quality multiplier floors and caps
const CREATOR_ORG_FLOOR = parseFloat(process.env.MINDSHARE_CREATOR_ORG_FLOOR || '0.5');
const CREATOR_ORG_CAP = parseFloat(process.env.MINDSHARE_CREATOR_ORG_CAP || '1.5');
const AUDIENCE_ORG_FLOOR = parseFloat(process.env.MINDSHARE_AUDIENCE_ORG_FLOOR || '0.5');
const AUDIENCE_ORG_CAP = parseFloat(process.env.MINDSHARE_AUDIENCE_ORG_CAP || '1.5');
const ORIGINALITY_FLOOR = parseFloat(process.env.MINDSHARE_ORIGINALITY_FLOOR || '0.7');
const ORIGINALITY_CAP = parseFloat(process.env.MINDSHARE_ORIGINALITY_CAP || '1.3');
const SENTIMENT_FLOOR = parseFloat(process.env.MINDSHARE_SENTIMENT_FLOOR || '0.8');
const SENTIMENT_CAP = parseFloat(process.env.MINDSHARE_SENTIMENT_CAP || '1.2');
const SMART_FOLLOWERS_FLOOR = parseFloat(process.env.MINDSHARE_SMART_FOLLOWERS_FLOOR || '1.0');
const SMART_FOLLOWERS_CAP = parseFloat(process.env.MINDSHARE_SMART_FOLLOWERS_CAP || '1.5');

// =============================================================================
// HELPER: Clamp value between min and max
// =============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// =============================================================================
// CORE: Calculate Attention Value
// =============================================================================

/**
 * Calculate raw attention value (before normalization)
 * Uses log-scaled inputs to prevent whale domination
 */
function calculateAttentionValue(inputs: ProjectMindshareInputs): number {
  // Core (log-scaled)
  const core = 
    W1_POSTS * Math.log1p(inputs.postsOrMentions) +
    W2_CREATORS * Math.log1p(inputs.uniqueCreators) +
    W3_ENGAGEMENT * Math.log1p(inputs.engagementTotal) +
    W4_CT_HEAT * inputs.ctHeatNorm;

  // Quality multipliers (bounded)
  const creatorOrg = clamp(inputs.creatorOrganicScore / 100, CREATOR_ORG_FLOOR, CREATOR_ORG_CAP);
  const audienceOrg = clamp(inputs.audienceOrganicScore / 100, AUDIENCE_ORG_FLOOR, AUDIENCE_ORG_CAP);
  const originality = clamp(inputs.originalityScore / 100, ORIGINALITY_FLOOR, ORIGINALITY_CAP);
  const sentiment = clamp(inputs.sentimentMultiplier, SENTIMENT_FLOOR, SENTIMENT_CAP);
  const smartBoost = clamp(inputs.smartFollowersBoost, SMART_FOLLOWERS_FLOOR, SMART_FOLLOWERS_CAP);

  // Keyword relevance multiplier
  const keywordMultiplier = inputs.keywordMatchStrength;

  // Final attention value
  const attention = core * creatorOrg * audienceOrg * originality * sentiment * smartBoost * keywordMultiplier;

  return Math.max(0, attention);
}

// =============================================================================
// MAIN: Calculate Mindshare (BPS Normalized)
// =============================================================================

/**
 * Calculate mindshare for a single project in a given window
 * Returns BPS normalized to 10,000 per window
 */
export async function calculateProjectMindshare(
  supabase: SupabaseClient,
  projectId: string,
  window: MindshareWindow
): Promise<MindshareResult> {
  // Calculate time boundaries
  const now = new Date();
  const windowStart = new Date(now);
  
  switch (window) {
    case '24h':
      windowStart.setHours(windowStart.getHours() - 24);
      break;
    case '48h':
      windowStart.setHours(windowStart.getHours() - 48);
      break;
    case '7d':
      windowStart.setDate(windowStart.getDate() - 7);
      break;
    case '30d':
      windowStart.setDate(windowStart.getDate() - 30);
      break;
  }

  // Get project keywords for relevance matching
  const { data: project } = await supabase
    .from('projects')
    .select('arc_keywords')
    .eq('id', projectId)
    .maybeSingle();

  const keywords = project?.arc_keywords || [];
  const hasKeywords = keywords.length > 0;

  // Fetch project_tweets for this window
  const { data: tweets } = await supabase
    .from('project_tweets')
    .select('author_handle, likes, replies, retweets, text, sentiment_score, created_at')
    .eq('project_id', projectId)
    .eq('is_official', false)
    .gte('created_at', windowStart.toISOString());

  if (!tweets || tweets.length === 0) {
    return {
      mindshare_bps: 0,
      delta_bps_1d: null,
      delta_bps_7d: null,
      attention_value: 0,
    };
  }

  // Filter by keyword relevance if keywords exist
  let relevantTweets = tweets;
  if (hasKeywords) {
    relevantTweets = tweets.filter(tweet => {
      const text = (tweet.text || '').toLowerCase();
      return keywords.some(keyword => 
        text.includes(keyword.toLowerCase()) || 
        text.includes(`$${keyword.toLowerCase()}`) ||
        text.includes(`@${keyword.toLowerCase()}`)
      );
    });
  }

  // Aggregate metrics
  const postsOrMentions = relevantTweets.length;
  const uniqueCreators = new Set(relevantTweets.map(t => t.author_handle?.toLowerCase())).size;
  const engagementTotal = relevantTweets.reduce((sum, t) => 
    sum + (t.likes || 0) + (t.replies || 0) * 2 + (t.retweets || 0) * 3, 0
  );

  // Get CT Heat (normalized 0-100) - use latest metrics_daily
  const { data: metrics } = await supabase
    .from('metrics_daily')
    .select('ct_heat')
    .eq('project_id', projectId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const ctHeatNorm = metrics?.ct_heat || 0;

  // Get quality scores (simplified - would need more sophisticated calculation)
  const avgSentiment = relevantTweets.length > 0
    ? relevantTweets.reduce((sum, t) => sum + (t.sentiment_score || 50), 0) / relevantTweets.length
    : 50;
  
  const sentimentMultiplier = 0.8 + (avgSentiment / 100) * 0.4; // 0.8-1.2 range

  // Placeholder quality scores (would need actual calculation)
  const creatorOrganicScore = 75; // TODO: Calculate from creator profiles
  const audienceOrganicScore = 75; // TODO: Calculate from audience quality
  const originalityScore = 80; // TODO: Calculate from content uniqueness
  const smartFollowersBoost = 1.0; // TODO: Get from smart followers system
  const keywordMatchStrength = hasKeywords ? 1.0 : 0.8; // Penalty if no keywords matched

  // Calculate attention value
  const attentionValue = calculateAttentionValue({
    projectId,
    window,
    postsOrMentions,
    uniqueCreators,
    engagementTotal,
    ctHeatNorm,
    creatorOrganicScore,
    audienceOrganicScore,
    originalityScore,
    sentimentMultiplier,
    smartFollowersBoost,
    keywordMatchStrength,
  });

  // For now, return attention value as-is (normalization happens at aggregate level)
  // In production, we'd normalize across all projects in the window
  return {
    mindshare_bps: Math.round(attentionValue), // Will be normalized in aggregate function
    delta_bps_1d: null, // TODO: Calculate from snapshots
    delta_bps_7d: null, // TODO: Calculate from snapshots
    attention_value: attentionValue,
  };
}

// =============================================================================
// AGGREGATE: Normalize All Projects to 10,000 BPS
// =============================================================================

/**
 * Normalize mindshare across all projects to sum to 10,000 bps
 * Distributes remainder to top attention_value projects
 */
export async function normalizeMindshareBPS(
  attentionValues: Array<{ projectId: string; attention_value: number }>
): Promise<Map<string, number>> {
  if (attentionValues.length === 0) {
    return new Map();
  }

  const totalAttention = attentionValues.reduce((sum, p) => sum + p.attention_value, 0);
  
  if (totalAttention === 0) {
    // All zero - distribute evenly
    const bpsPerProject = Math.floor(10000 / attentionValues.length);
    const remainder = 10000 - (bpsPerProject * attentionValues.length);
    
    const result = new Map<string, number>();
    attentionValues.forEach((p, i) => {
      result.set(p.projectId, bpsPerProject + (i < remainder ? 1 : 0));
    });
    return result;
  }

  // Calculate proportional BPS
  const bpsMap = new Map<string, number>();
  let allocatedBPS = 0;

  // Sort by attention value descending
  const sorted = [...attentionValues].sort((a, b) => b.attention_value - a.attention_value);

  for (const project of sorted) {
    const bps = Math.floor((project.attention_value / totalAttention) * 10000);
    bpsMap.set(project.projectId, bps);
    allocatedBPS += bps;
  }

  // Distribute remainder to top projects
  const remainder = 10000 - allocatedBPS;
  if (remainder > 0) {
    for (let i = 0; i < remainder && i < sorted.length; i++) {
      const projectId = sorted[i].projectId;
      bpsMap.set(projectId, (bpsMap.get(projectId) || 0) + 1);
    }
  }

  return bpsMap;
}

