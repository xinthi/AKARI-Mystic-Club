/**
 * Smart Followers PageRank Calculation Script
 * 
 * Calculates PageRank, bot risk, and smart scores for all tracked profiles.
 * Run daily via cron after graph ingestion.
 * 
 * Usage: pnpm tsx scripts/smart-followers/calculate-pagerank.ts
 */

import { createServiceClient } from '@/web/lib/portal/supabase';

// =============================================================================
// CONFIGURATION (from env vars)
// =============================================================================

const SMART_FOLLOWERS_TOP_N = parseInt(process.env.SMART_FOLLOWERS_TOP_N || '1000', 10);
const SMART_FOLLOWERS_TOP_PCT = parseFloat(process.env.SMART_FOLLOWERS_TOP_PCT || '0.1');
const BOT_RISK_THRESHOLD = parseFloat(process.env.BOT_RISK_THRESHOLD || '0.5');
const MIN_ACCOUNT_AGE_DAYS = parseInt(process.env.MIN_ACCOUNT_AGE_DAYS || '90', 10);

// =============================================================================
// PAGE RANK ALGORITHM
// =============================================================================

/**
 * Simple PageRank implementation
 * Returns map of x_user_id -> pagerank score
 */
function calculatePageRank(
  edges: Array<{ src_user_id: string; dst_user_id: string }>,
  nodes: string[],
  iterations: number = 10,
  dampingFactor: number = 0.85
): Map<string, number> {
  const nodeSet = new Set(nodes);
  const inEdges = new Map<string, string[]>(); // dst -> [src1, src2, ...]
  const outDegree = new Map<string, number>(); // src -> count

  // Build graph
  for (const edge of edges) {
    if (!nodeSet.has(edge.src_user_id) || !nodeSet.has(edge.dst_user_id)) {
      continue; // Skip edges with nodes not in our set
    }

    if (!inEdges.has(edge.dst_user_id)) {
      inEdges.set(edge.dst_user_id, []);
    }
    inEdges.get(edge.dst_user_id)!.push(edge.src_user_id);

    outDegree.set(edge.src_user_id, (outDegree.get(edge.src_user_id) || 0) + 1);
  }

  // Initialize PageRank scores
  const n = nodes.length;
  const initialScore = 1.0 / n;
  let scores = new Map<string, number>();
  for (const node of nodes) {
    scores.set(node, initialScore);
  }

  // Iterate
  for (let iter = 0; iter < iterations; iter++) {
    const newScores = new Map<string, number>();

    for (const node of nodes) {
      let sum = 0;
      const incoming = inEdges.get(node) || [];

      for (const src of incoming) {
        const srcScore = scores.get(src) || 0;
        const srcOutDegree = outDegree.get(src) || 1;
        sum += srcScore / srcOutDegree;
      }

      const newScore = (1 - dampingFactor) / n + dampingFactor * sum;
      newScores.set(node, newScore);
    }

    scores = newScores;
  }

  return scores;
}

/**
 * Calculate bot risk score (0-1, higher = more risky)
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
// MAIN
// =============================================================================

async function main() {
  console.log('[PageRank] Starting Smart Followers PageRank calculation...');
  
  const supabase = createServiceClient();
  const asOfDate = new Date().toISOString().split('T')[0];

  // 1. Get all tracked profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('tracked_profiles')
    .select('x_user_id, followers_count, following_count, account_created_at');

  if (profilesError || !profiles) {
    console.error('[PageRank] Error fetching profiles:', profilesError);
    throw new Error('Failed to fetch tracked profiles');
  }

  console.log(`[PageRank] Found ${profiles.length} tracked profiles`);

  // 2. Get all edges
  const { data: edges, error: edgesError } = await supabase
    .from('x_follow_edges')
    .select('src_user_id, dst_user_id');

  if (edgesError) {
    console.error('[PageRank] Error fetching edges:', edgesError);
    throw new Error('Failed to fetch graph edges');
  }

  console.log(`[PageRank] Found ${edges?.length || 0} graph edges`);

  if (!edges || edges.length === 0) {
    console.log('[PageRank] No edges found - graph not yet built. Skipping PageRank calculation.');
    console.log('[PageRank] Note: System will use fallback "Smart Audience Estimate" mode.');
    return;
  }

  // 3. Calculate PageRank
  const nodeIds = profiles.map(p => p.x_user_id);
  const edgeList = edges.map(e => ({ src_user_id: e.src_user_id, dst_user_id: e.dst_user_id }));
  
  console.log('[PageRank] Calculating PageRank...');
  const pagerankScores = calculatePageRank(edgeList, nodeIds);

  // 4. Calculate bot risk and smart scores
  const scores: Array<{
    x_user_id: string;
    pagerank: number;
    bot_risk: number;
    smart_score: number;
    is_smart: boolean;
  }> = [];

  for (const profile of profiles) {
    const pagerank = pagerankScores.get(profile.x_user_id) || 0;
    const botRisk = calculateBotRisk(profile);
    const smartScore = pagerank * (1 - botRisk);

    scores.push({
      x_user_id: profile.x_user_id,
      pagerank,
      bot_risk: botRisk,
      smart_score: smartScore,
      is_smart: false, // Will be set after sorting
    });
  }

  // 5. Mark top N or top pct as smart
  scores.sort((a, b) => b.smart_score - a.smart_score);
  
  const topN = Math.min(SMART_FOLLOWERS_TOP_N, scores.length);
  const topPct = Math.floor(scores.length * SMART_FOLLOWERS_TOP_PCT);
  const smartThreshold = Math.max(topN, topPct);

  for (let i = 0; i < scores.length; i++) {
    scores[i].is_smart = i < smartThreshold;
  }

  console.log(`[PageRank] Marked ${smartThreshold} accounts as smart (top ${Math.round((smartThreshold / scores.length) * 100)}%)`);

  // 6. Store in smart_account_scores
  console.log('[PageRank] Storing scores in database...');
  
  const { error: upsertError } = await supabase
    .from('smart_account_scores')
    .upsert(
      scores.map(s => ({
        x_user_id: s.x_user_id,
        pagerank: s.pagerank,
        bot_risk: s.bot_risk,
        smart_score: s.smart_score,
        is_smart: s.is_smart,
        as_of_date: asOfDate,
      })),
      {
        onConflict: 'x_user_id,as_of_date',
      }
    );

  if (upsertError) {
    console.error('[PageRank] Error storing scores:', upsertError);
    throw new Error('Failed to store smart account scores');
  }

  console.log(`[PageRank] Stored ${scores.length} smart account scores`);
  console.log('[PageRank] PageRank calculation complete!');
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('[PageRank] Fatal error:', error);
    process.exit(1);
  });
}

export { main as calculatePageRank };

