/**
 * Project Scoring Module
 * 
 * Implements the AKARI Project Score algorithm (0-1000) based on:
 * - Official account profile score
 * - Weighted average KOL profile score
 * - Sentiment score
 * - CT Heat score
 * - Inner Circle impact
 * - Community quality
 * 
 * Final formula:
 *   Project_0_100 = 
 *     0.30 * Official_ProfileScore_0_100 +
 *     0.20 * Weighted_avg_KOL_ProfileScore_0_100 +
 *     0.15 * Sentiment_0_100 +
 *     0.15 * CT_Heat_0_100 +
 *     0.10 * InnerCircle_Impact_0_100 +
 *     0.10 * Community_Quality_0_100
 *   
 *   AKARI_Project_Score = round(Project_0_100 * 10)
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ProjectScoreInputs {
  officialProfileScore: number;    // 0-1000 profile score of project account
  kolProfileScores: {              // Inner circle KOLs who engage with project
    score: number;                 // 0-1000
    weight: number;                // Engagement weight
  }[];
  sentimentScore: number;          // 0-100 from metrics_daily
  ctHeatScore: number;             // 0-100 from metrics_daily
  innerCircleCount: number;        // Number of inner circle members
  innerCirclePower: number;        // Sum of influence scores
  qualityFollowerRatio: number;    // 0-1 ratio of quality followers
  followersDelta: number;          // Change in followers (for growth)
  previousFollowers: number;       // Previous follower count
}

export interface ProjectScoreResult {
  akariProjectScore: number;       // 0-1000
  officialScore0to100: number;     // 0-100 (converted from profile score)
  kolAverageScore0to100: number;   // 0-100
  innerCircleImpact0to100: number; // 0-100
  communityQuality0to100: number;  // 0-100
}

// =============================================================================
// HELPERS
// =============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// =============================================================================
// SCORE COMPUTATION
// =============================================================================

/**
 * Compute Inner Circle Impact Score (0-100)
 * 
 * Based on:
 * - inner_circle_count: Number of profiles in the project's inner circle
 * - inner_circle_power: Sum of influence scores of those profiles
 */
export function computeInnerCircleImpact(
  innerCircleCount: number,
  innerCirclePower: number
): number {
  // Count component: up to 60 points for 30+ inner circle members
  const countComponent = Math.min(1, innerCircleCount / 30) * 60;
  
  // Power component: up to 40 points for 5000+ total influence
  const powerComponent = Math.min(1, innerCirclePower / 5000) * 40;
  
  return clamp(Math.round(countComponent + powerComponent), 0, 100);
}

/**
 * Compute Community Quality Score (0-100)
 * 
 * Based on:
 * - quality_follower_ratio: Percentage of quality followers
 * - growth: Follower delta normalized
 */
export function computeCommunityQuality(
  qualityFollowerRatio: number,
  followersDelta: number,
  previousFollowers: number
): number {
  // Quality ratio component: up to 80 points
  const qualityComponent = qualityFollowerRatio * 80;
  
  // Growth component: up to 20 points
  // Normalize growth to 0-1 range (e.g., 10% growth = 1)
  let growthScore = 0;
  if (previousFollowers > 0) {
    const growthRate = followersDelta / previousFollowers;
    growthScore = Math.min(1, Math.max(0, growthRate / 0.1)); // 10% growth = max
  }
  const growthComponent = growthScore * 20;
  
  return clamp(Math.round(qualityComponent + growthComponent), 0, 100);
}

/**
 * Compute weighted average of KOL profile scores
 */
export function computeWeightedKolScore(
  kolScores: { score: number; weight: number }[]
): number {
  if (kolScores.length === 0) return 50; // Default if no KOLs
  
  const totalWeight = kolScores.reduce((sum, k) => sum + k.weight, 0);
  if (totalWeight === 0) return 50;
  
  const weightedSum = kolScores.reduce(
    (sum, k) => sum + (k.score / 10) * k.weight, // Convert 0-1000 to 0-100
    0
  );
  
  return clamp(Math.round(weightedSum / totalWeight), 0, 100);
}

/**
 * Compute the final AKARI Project Score (0-1000)
 */
export function computeAkariProjectScore(inputs: ProjectScoreInputs): ProjectScoreResult {
  // Convert profile score from 0-1000 to 0-100
  const officialScore0to100 = Math.round(inputs.officialProfileScore / 10);
  
  // Compute weighted average KOL score
  const kolAverageScore0to100 = computeWeightedKolScore(inputs.kolProfileScores);
  
  // Compute inner circle impact
  const innerCircleImpact0to100 = computeInnerCircleImpact(
    inputs.innerCircleCount,
    inputs.innerCirclePower
  );
  
  // Compute community quality
  const communityQuality0to100 = computeCommunityQuality(
    inputs.qualityFollowerRatio,
    inputs.followersDelta,
    inputs.previousFollowers
  );
  
  // Weighted average
  const project0to100 = 
    0.30 * officialScore0to100 +
    0.20 * kolAverageScore0to100 +
    0.15 * inputs.sentimentScore +
    0.15 * inputs.ctHeatScore +
    0.10 * innerCircleImpact0to100 +
    0.10 * communityQuality0to100;
  
  // Scale to 0-1000
  const akariProjectScore = clamp(Math.round(project0to100 * 10), 0, 1000);
  
  return {
    akariProjectScore,
    officialScore0to100,
    kolAverageScore0to100,
    innerCircleImpact0to100,
    communityQuality0to100,
  };
}

/**
 * Map AKARI Project Score to tier name
 */
export function mapProjectScoreToTier(score: number): {
  name: string;
  color: string;
  minScore: number;
} {
  if (score >= 900) return { name: 'Celestial', color: '#A855F7', minScore: 900 };
  if (score >= 750) return { name: 'Vanguard', color: '#00E5A0', minScore: 750 };
  if (score >= 550) return { name: 'Ranger', color: '#60A5FA', minScore: 550 };
  if (score >= 400) return { name: 'Nomad', color: '#FBBF24', minScore: 400 };
  return { name: 'Shadow', color: '#6B7280', minScore: 0 };
}

