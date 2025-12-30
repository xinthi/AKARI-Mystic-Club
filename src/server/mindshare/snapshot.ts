/**
 * Mindshare Snapshot Rollup
 * 
 * ⚠️ SERVER-SIDE ONLY ⚠️
 * 
 * Computes daily mindshare snapshots for all projects across time windows.
 * Normalizes attention values to BPS (basis points, 0-10000) ensuring sum = 10000.
 */

import { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

export type TimeWindow = '24h' | '48h' | '7d' | '30d';

export interface ProjectMetrics {
  projectId: string;
  postsOrMentions: number;
  uniqueCreators: number;
  engagementTotal: number;
  ctHeatNorm: number;
  sentimentScore: number;
  attentionValue: number;
}

export interface SnapshotResult {
  window: TimeWindow;
  asOfDate: string;
  totalProjects: number;
  snapshotsCreated: number;
  snapshotsUpdated: number;
  errors: string[];
}

// =============================================================================
// CONFIGURATION (from env vars)
// =============================================================================

function getEnvFloat(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

const W1_POSTS = getEnvFloat('MINDSHARE_W1_POSTS', 0.25);
const W2_CREATORS = getEnvFloat('MINDSHARE_W2_CREATORS', 0.25);
const W3_ENGAGEMENT = getEnvFloat('MINDSHARE_W3_ENGAGEMENT', 0.30);
const W4_CT_HEAT = getEnvFloat('MINDSHARE_W4_CT_HEAT', 0.20);

const SENTIMENT_FLOOR = getEnvFloat('MINDSHARE_SENTIMENT_FLOOR', 0.8);
const SENTIMENT_CAP = getEnvFloat('MINDSHARE_SENTIMENT_CAP', 1.2);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert time window to hours
 */
function windowToHours(window: TimeWindow): number {
  switch (window) {
    case '24h': return 24;
    case '48h': return 48;
    case '7d': return 7 * 24;
    case '30d': return 30 * 24;
  }
}

/**
 * Calculate sentiment multiplier (bounded)
 */
function calculateSentimentMultiplier(sentimentScore: number): number {
  // Sentiment score is 0-100, map to multiplier range
  // 0-50: below floor, 50-100: floor to cap
  if (sentimentScore <= 50) {
    return SENTIMENT_FLOOR;
  }
  const normalized = (sentimentScore - 50) / 50; // 0-1
  return SENTIMENT_FLOOR + normalized * (SENTIMENT_CAP - SENTIMENT_FLOOR);
}

/**
 * Normalize attention values to BPS (0-10000) ensuring sum = 10000 exactly
 */
export function normalizeToBps(attentionValues: Map<string, number>): Map<string, number> {
  const entries = Array.from(attentionValues.entries());
  
  if (entries.length === 0) {
    return new Map();
  }

  // Calculate total attention
  const totalAttention = entries.reduce((sum, [, value]) => sum + value, 0);
  
  if (totalAttention === 0) {
    // Distribute evenly if all zero
    const bpsPerProject = Math.floor(10000 / entries.length);
    const remainder = 10000 - (bpsPerProject * entries.length);
    const result = new Map<string, number>();
    
    entries.forEach(([projectId], index) => {
      let bps = bpsPerProject;
      // Distribute remainder to first N projects
      if (index < remainder) {
        bps += 1;
      }
      result.set(projectId, bps);
    });
    
    return result;
  }

  // Normalize proportionally
  const bpsMap = new Map<string, number>();
  let totalBps = 0;
  
  // First pass: calculate integer BPS
  for (const [projectId, attention] of entries) {
    const bps = Math.floor((attention / totalAttention) * 10000);
    bpsMap.set(projectId, bps);
    totalBps += bps;
  }
  
  // Handle rounding drift: distribute remainder to top attention projects
  const remainder = 10000 - totalBps;
  if (remainder > 0) {
    // Sort by attention value descending
    const sorted = [...entries].sort((a, b) => b[1] - a[1]);
    
    // Distribute remainder to top projects
    for (let i = 0; i < remainder && i < sorted.length; i++) {
      const projectId = sorted[i][0];
      const currentBps = bpsMap.get(projectId) || 0;
      bpsMap.set(projectId, currentBps + 1);
    }
  } else if (remainder < 0) {
    // If we overshot (shouldn't happen, but handle gracefully)
    const sorted = [...entries].sort((a, b) => a[1] - b[1]);
    let toRemove = Math.abs(remainder);
    
    for (let i = 0; i < toRemove && i < sorted.length; i++) {
      const projectId = sorted[i][0];
      const currentBps = bpsMap.get(projectId) || 0;
      if (currentBps > 0) {
        bpsMap.set(projectId, currentBps - 1);
        toRemove--;
      }
    }
  }
  
  return bpsMap;
}

// =============================================================================
// AGGREGATION FUNCTIONS
// =============================================================================

/**
 * Fetch and aggregate project metrics for a time window
 */
async function aggregateProjectMetrics(
  supabase: SupabaseClient,
  projectId: string,
  window: TimeWindow,
  asOfDate: Date
): Promise<ProjectMetrics | null> {
  const hoursBack = windowToHours(window);
  const startDate = new Date(asOfDate.getTime() - hoursBack * 60 * 60 * 1000);
  
  // Fetch project info (for arc_keywords)
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('arc_keywords, is_active')
    .eq('id', projectId)
    .single();
  
  if (projectError || !project || !project.is_active) {
    return null;
  }
  
  // Fetch tweets in window (mentions only, is_official = false)
  let query = supabase
    .from('project_tweets')
    .select('author_handle, text, likes, replies, retweets, sentiment_score')
    .eq('project_id', projectId)
    .eq('is_official', false)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', asOfDate.toISOString());
  
  const { data: tweets, error: tweetsError } = await query;
  
  if (tweetsError) {
    console.error(`[aggregateProjectMetrics] Error fetching tweets for ${projectId}:`, tweetsError);
    return null;
  }
  
  if (!tweets || tweets.length === 0) {
    // Return zero metrics
    return {
      projectId,
      postsOrMentions: 0,
      uniqueCreators: 0,
      engagementTotal: 0,
      ctHeatNorm: 0,
      sentimentScore: 50, // Neutral
      attentionValue: 0,
    };
  }
  
  // Filter by keywords if arc_keywords exists and is not empty
  let relevantTweets = tweets;
  const arcKeywords = project.arc_keywords;
  if (arcKeywords) {
    // Handle both string and array formats
    const keywordsArray = Array.isArray(arcKeywords)
      ? arcKeywords.map(k => String(k).toLowerCase().trim())
      : String(arcKeywords).toLowerCase().split(',').map(k => k.trim());
    
    if (keywordsArray.length > 0 && keywordsArray[0] !== '') {
      relevantTweets = tweets.filter(tweet => {
        const text = (tweet.text || '').toLowerCase();
        return keywordsArray.some(keyword => text.includes(keyword));
      });
    }
  }
  
  // Aggregate metrics
  const postsOrMentions = relevantTweets.length;
  const uniqueCreators = new Set(relevantTweets.map(t => t.author_handle)).size;
  const engagementTotal = relevantTweets.reduce((sum, t) => {
    return sum + (t.likes || 0) + (t.replies || 0) * 2 + (t.retweets || 0) * 3;
  }, 0);
  
  // Get latest CT heat from metrics_daily
  const { data: latestMetrics } = await supabase
    .from('metrics_daily')
    .select('ct_heat_score')
    .eq('project_id', projectId)
    .order('date', { ascending: false })
    .limit(1)
    .single();
  
  const ctHeatNorm = latestMetrics?.ct_heat_score || 0; // 0-100
  
  // Calculate average sentiment
  const sentimentScores = relevantTweets
    .map(t => t.sentiment_score)
    .filter((s): s is number => s !== null && s !== undefined);
  const avgSentiment = sentimentScores.length > 0
    ? sentimentScores.reduce((sum, s) => sum + s, 0) / sentimentScores.length
    : 50; // Default neutral
  
  // Calculate core score
  const core = 
    W1_POSTS * Math.log1p(postsOrMentions) +
    W2_CREATORS * Math.log1p(uniqueCreators) +
    W3_ENGAGEMENT * Math.log1p(engagementTotal) +
    W4_CT_HEAT * (ctHeatNorm / 100); // Normalize CT heat to 0-1
  
  // Calculate quality multiplier (simplified MVP: sentiment only)
  const sentimentMultiplier = calculateSentimentMultiplier(avgSentiment);
  
  // Keyword match strength (1.0 if keywords exist, 0.8 if not)
  // Keyword match strength: 1.0 if keywords exist, 0.8 if not
  const arcKeywords = project.arc_keywords;
  const hasKeywords = arcKeywords && (
    Array.isArray(arcKeywords) ? arcKeywords.length > 0 : String(arcKeywords).trim() !== ''
  );
  const keywordMatchStrength = hasKeywords ? 1.0 : 0.8;
  
  // Calculate attention value
  const attentionValue = core * sentimentMultiplier * keywordMatchStrength;
  
  return {
    projectId,
    postsOrMentions,
    uniqueCreators,
    engagementTotal,
    ctHeatNorm,
    sentimentScore: avgSentiment,
    attentionValue,
  };
}

// =============================================================================
// MAIN ROLLUP FUNCTION
// =============================================================================

/**
 * Compute mindshare snapshots for a specific window and date
 */
export async function computeMindshareSnapshots(
  supabase: SupabaseClient,
  window: TimeWindow,
  asOfDate: Date = new Date()
): Promise<SnapshotResult> {
  const asOfDateStr = asOfDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const errors: string[] = [];
  
  console.log(`[computeMindshareSnapshots] Starting for window=${window}, asOfDate=${asOfDateStr}`);
  
  // Fetch all active projects
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id')
    .eq('is_active', true)
    .or('profile_type.eq.project,is_company.eq.true');
  
  if (projectsError) {
    return {
      window,
      asOfDate: asOfDateStr,
      totalProjects: 0,
      snapshotsCreated: 0,
      snapshotsUpdated: 0,
      errors: [`Failed to fetch projects: ${projectsError.message}`],
    };
  }
  
  if (!projects || projects.length === 0) {
    return {
      window,
      asOfDate: asOfDateStr,
      totalProjects: 0,
      snapshotsCreated: 0,
      snapshotsUpdated: 0,
      errors: [],
    };
  }
  
  console.log(`[computeMindshareSnapshots] Processing ${projects.length} projects`);
  
  // Aggregate metrics for all projects
  const attentionValues = new Map<string, number>();
  const metricsMap = new Map<string, ProjectMetrics>();
  
  for (const project of projects) {
    try {
      const metrics = await aggregateProjectMetrics(supabase, project.id, window, asOfDate);
      if (metrics) {
        attentionValues.set(project.id, metrics.attentionValue);
        metricsMap.set(project.id, metrics);
      }
    } catch (error) {
      const errorMsg = `Error processing project ${project.id}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[computeMindshareSnapshots] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }
  
  // Normalize to BPS
  const bpsMap = normalizeToBps(attentionValues);
  
  // Verify sum = 10000
  const totalBps = Array.from(bpsMap.values()).reduce((sum, bps) => sum + bps, 0);
  if (totalBps !== 10000 && bpsMap.size > 0) {
    console.warn(`[computeMindshareSnapshots] BPS sum is ${totalBps}, expected 10000. Adjusting...`);
    // Adjust last project to fix sum
    const entries = Array.from(bpsMap.entries());
    if (entries.length > 0) {
      const lastEntry = entries[entries.length - 1];
      const adjustment = 10000 - totalBps;
      bpsMap.set(lastEntry[0], lastEntry[1] + adjustment);
    }
  }
  
  // Upsert snapshots
  let snapshotsCreated = 0;
  let snapshotsUpdated = 0;
  
  const upsertData = Array.from(bpsMap.entries()).map(([projectId, bps]) => {
    const metrics = metricsMap.get(projectId);
    return {
      project_id: projectId,
      time_window: window,
      mindshare_bps: bps,
      attention_value: metrics?.attentionValue || 0,
      as_of_date: asOfDateStr,
    };
  });
  
  if (upsertData.length > 0) {
    // Check existing snapshots to determine created vs updated
    const { data: existing } = await supabase
      .from('project_mindshare_snapshots')
      .select('project_id')
      .eq('time_window', window)
      .eq('as_of_date', asOfDateStr)
      .in('project_id', upsertData.map(d => d.project_id));
    
    const existingProjectIds = new Set((existing || []).map(e => e.project_id));
    
    const { error: upsertError } = await supabase
      .from('project_mindshare_snapshots')
      .upsert(upsertData, {
        onConflict: 'project_id,time_window,as_of_date',
      });
    
    if (upsertError) {
      errors.push(`Failed to upsert snapshots: ${upsertError.message}`);
    } else {
      // Count created vs updated
      for (const data of upsertData) {
        if (existingProjectIds.has(data.project_id)) {
          snapshotsUpdated++;
        } else {
          snapshotsCreated++;
        }
      }
    }
  }
  
  console.log(`[computeMindshareSnapshots] Completed: created=${snapshotsCreated}, updated=${snapshotsUpdated}, errors=${errors.length}`);
  
  return {
    window,
    asOfDate: asOfDateStr,
    totalProjects: projects.length,
    snapshotsCreated,
    snapshotsUpdated,
    errors,
  };
}

/**
 * Compute mindshare snapshots for all windows
 */
export async function computeAllMindshareSnapshots(
  supabase: SupabaseClient,
  asOfDate: Date = new Date()
): Promise<SnapshotResult[]> {
  const windows: TimeWindow[] = ['24h', '48h', '7d', '30d'];
  const results: SnapshotResult[] = [];
  
  for (const window of windows) {
    const result = await computeMindshareSnapshots(supabase, window, asOfDate);
    results.push(result);
  }
  
  return results;
}
