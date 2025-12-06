/**
 * AKARI Score Computation Module
 * 
 * ⚠️ CONFIDENTIAL - SERVER-SIDE ONLY ⚠️
 * 
 * This module contains proprietary scoring algorithms.
 * DO NOT import this file in any client-side/browser code.
 * Only use in: scripts/, API routes (server functions), cron jobs.
 * 
 * Computes the AKARI credibility score (0-1000) for Twitter/X accounts.
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Input metrics for AKARI score calculation
 */
export interface AkariScoreInput {
  /** Number of followers */
  followers: number;

  /** Number of accounts they follow */
  following: number;

  /** Account age in years (decimal, e.g., 1.5 = 18 months) */
  accountAgeYears: number;

  /** Average likes per tweet (recent sample) */
  avgLikesPerTweet: number;

  /** Average replies per tweet (recent sample) */
  avgRepliesPerTweet: number;

  /** Average retweets per tweet (recent sample) */
  avgRetweetsPerTweet: number;

  /** Standard deviation of engagement (likes/replies/retweets) - measures consistency */
  engagementStdDev?: number;

  /** Optional: Quality score of followers (0-100) - how credible are their followers */
  followerQualitySample?: number;

  /** Optional: Number of tweets in the sample used for engagement metrics */
  tweetSampleSize?: number;
}

/**
 * AKARI score tiers with labels and thresholds
 */
export type AkariTier = 'Celestial' | 'Vanguard' | 'Ranger' | 'Nomad' | 'Shadow';

export interface AkariTierInfo {
  tier: AkariTier;
  minScore: number;
  maxScore: number;
  description: string;
  color: string;
}

// =============================================================================
// TIER DEFINITIONS
// =============================================================================

/**
 * AKARI tier definitions
 * - Celestial (900-1000): Top-tier credibility, highly influential
 * - Vanguard (750-899): Strong credibility, respected voice
 * - Ranger (550-749): Good credibility, growing influence
 * - Nomad (400-549): Developing credibility, newer accounts
 * - Shadow (0-399): Low credibility, potential bots/farms
 */
export const AKARI_TIERS: AkariTierInfo[] = [
  {
    tier: 'Celestial',
    minScore: 900,
    maxScore: 1000,
    description: 'Top-tier credibility, highly influential',
    color: '#9945FF', // Purple
  },
  {
    tier: 'Vanguard',
    minScore: 750,
    maxScore: 899,
    description: 'Strong credibility, respected voice',
    color: '#00F6A2', // Akari primary green
  },
  {
    tier: 'Ranger',
    minScore: 550,
    maxScore: 749,
    description: 'Good credibility, growing influence',
    color: '#3B82F6', // Blue
  },
  {
    tier: 'Nomad',
    minScore: 400,
    maxScore: 549,
    description: 'Developing credibility, newer accounts',
    color: '#7BFFDA', // Akari accent
  },
  {
    tier: 'Shadow',
    minScore: 0,
    maxScore: 399,
    description: 'Low credibility, potential bot activity',
    color: '#8CA0B8', // Muted gray
  },
];

// =============================================================================
// SCORE COMPUTATION
// =============================================================================

/**
 * Compute the AKARI score (0-1000) from account metrics.
 * 
 * The score is a weighted combination of:
 * - Engagement rate component (30%)
 * - Account age component (20%)
 * - Follower/following ratio component (20%)
 * - Engagement consistency component (15%)
 * - Follower quality component (15%)
 * 
 * @param input - Account metrics
 * @returns AKARI score from 0 to 1000
 */
export function computeAkariScore(input: AkariScoreInput): number {
  const {
    followers,
    following,
    accountAgeYears,
    avgLikesPerTweet,
    avgRepliesPerTweet,
    avgRetweetsPerTweet,
    engagementStdDev = 0,
    followerQualitySample = 50, // Default to neutral if not provided
    tweetSampleSize = 20,
  } = input;

  // Edge case: brand new or zero-follower accounts
  if (followers === 0) {
    return 100; // Minimum score for zero-follower accounts
  }

  // ==========================================================================
  // Component 1: Engagement Rate (30% weight)
  // Measures how much engagement they get relative to followers
  // ==========================================================================
  const totalEngagement = avgLikesPerTweet + avgRepliesPerTweet + avgRetweetsPerTweet;
  const engagementRate = (totalEngagement / followers) * 100;

  // Typical engagement rate on Twitter is 0.5-3%
  // Excellent: > 3%, Good: 1-3%, Average: 0.5-1%, Poor: < 0.5%
  let engagementScore: number;
  if (engagementRate >= 3) {
    engagementScore = 1000;
  } else if (engagementRate >= 1) {
    engagementScore = 700 + ((engagementRate - 1) / 2) * 300; // 700-1000
  } else if (engagementRate >= 0.5) {
    engagementScore = 500 + ((engagementRate - 0.5) / 0.5) * 200; // 500-700
  } else if (engagementRate >= 0.1) {
    engagementScore = 200 + ((engagementRate - 0.1) / 0.4) * 300; // 200-500
  } else {
    engagementScore = (engagementRate / 0.1) * 200; // 0-200
  }

  // ==========================================================================
  // Component 2: Account Age (20% weight)
  // Older accounts are more credible; < 6 months gets penalty
  // ==========================================================================
  let ageScore: number;
  if (accountAgeYears >= 3) {
    ageScore = 1000; // 3+ years is maximum
  } else if (accountAgeYears >= 1) {
    ageScore = 600 + ((accountAgeYears - 1) / 2) * 400; // 600-1000
  } else if (accountAgeYears >= 0.5) {
    ageScore = 300 + ((accountAgeYears - 0.5) / 0.5) * 300; // 300-600
  } else {
    // < 6 months: heavy penalty
    ageScore = (accountAgeYears / 0.5) * 300; // 0-300
  }

  // ==========================================================================
  // Component 3: Follower/Following Ratio (20% weight)
  // High ratio = people follow them but they don't follow back = credible
  // Low ratio = follow-for-follow behavior = less credible
  // ==========================================================================
  const ratio = following > 0 ? followers / following : followers; // Handle zero following

  let ratioScore: number;
  if (ratio >= 10) {
    ratioScore = 1000; // Excellent: 10:1 or better
  } else if (ratio >= 3) {
    ratioScore = 700 + ((ratio - 3) / 7) * 300; // 700-1000
  } else if (ratio >= 1) {
    ratioScore = 400 + ((ratio - 1) / 2) * 300; // 400-700
  } else if (ratio >= 0.5) {
    ratioScore = 200 + ((ratio - 0.5) / 0.5) * 200; // 200-400
  } else {
    // Very low ratio: they follow way more than follow them
    ratioScore = (ratio / 0.5) * 200; // 0-200
  }

  // Penalty for excessive following (potential follow/unfollow spam)
  if (following > 5000 && ratio < 1) {
    ratioScore = Math.max(0, ratioScore - 200);
  }

  // ==========================================================================
  // Component 4: Engagement Consistency (15% weight)
  // Low variance = potentially bot/farm behavior
  // Natural accounts have variable engagement
  // ==========================================================================
  let consistencyScore: number;

  // If we have engagement std dev data
  if (engagementStdDev !== undefined && tweetSampleSize >= 5) {
    // Coefficient of variation (CV) = stdDev / mean
    const meanEngagement = totalEngagement || 1;
    const cv = engagementStdDev / meanEngagement;

    // Natural accounts typically have CV of 0.5-2.0
    // Bots/farms have very low CV (< 0.2) or very high CV (> 3.0)
    if (cv >= 0.3 && cv <= 2.0) {
      consistencyScore = 1000; // Natural variance
    } else if (cv >= 0.1 && cv < 0.3) {
      consistencyScore = 500 + ((cv - 0.1) / 0.2) * 500; // 500-1000
    } else if (cv < 0.1) {
      // Very low variance - suspicious
      consistencyScore = (cv / 0.1) * 500; // 0-500
    } else if (cv > 2.0 && cv <= 3.0) {
      consistencyScore = 700 + ((3.0 - cv) / 1.0) * 300; // 700-1000
    } else {
      // Very high variance - erratic behavior
      consistencyScore = Math.max(0, 700 - ((cv - 3.0) / 2.0) * 400);
    }
  } else {
    // No variance data, assume neutral
    consistencyScore = 600;
  }

  // ==========================================================================
  // Component 5: Follower Quality (15% weight)
  // Based on sample of followers and their credibility
  // ==========================================================================
  // Scale 0-100 to 0-1000
  const qualityScore = (followerQualitySample / 100) * 1000;

  // ==========================================================================
  // Weighted Combination
  // ==========================================================================
  const weightedScore =
    engagementScore * 0.30 +
    ageScore * 0.20 +
    ratioScore * 0.20 +
    consistencyScore * 0.15 +
    qualityScore * 0.15;

  // Apply floor and ceiling
  const finalScore = Math.round(Math.max(0, Math.min(1000, weightedScore)));

  return finalScore;
}

/**
 * Map an AKARI score to its tier.
 * 
 * @param score - AKARI score (0-1000)
 * @returns Tier information
 */
export function mapAkariScoreToTier(score: number | null): AkariTierInfo {
  if (score === null) {
    return {
      tier: 'Shadow',
      minScore: 0,
      maxScore: 399,
      description: 'Unranked - no data available',
      color: '#8CA0B8',
    };
  }

  // Find the matching tier
  for (const tier of AKARI_TIERS) {
    if (score >= tier.minScore && score <= tier.maxScore) {
      return tier;
    }
  }

  // Fallback (should never reach here)
  return AKARI_TIERS[AKARI_TIERS.length - 1];
}

/**
 * Get just the tier name from a score.
 * Convenience function for simple lookups.
 * 
 * @param score - AKARI score (0-1000)
 * @returns Tier name
 */
export function getAkariTierName(score: number | null): AkariTier {
  return mapAkariScoreToTier(score).tier;
}

// =============================================================================
// SIMPLIFIED COMPUTATION (for when we don't have all metrics)
// =============================================================================

/**
 * Simplified AKARI score computation for when we only have basic metrics.
 * Used during initial data collection before we have engagement variance data.
 * 
 * @param followers - Follower count
 * @param following - Following count
 * @param avgEngagement - Average engagement per tweet (likes + replies + retweets)
 * @param accountAgeYears - Account age in years
 * @returns AKARI score from 0 to 1000
 */
export function computeSimplifiedAkariScore(
  followers: number,
  following: number,
  avgEngagement: number,
  accountAgeYears: number
): number {
  return computeAkariScore({
    followers,
    following,
    accountAgeYears,
    avgLikesPerTweet: avgEngagement * 0.7, // Assume 70% of engagement is likes
    avgRepliesPerTweet: avgEngagement * 0.1, // 10% replies
    avgRetweetsPerTweet: avgEngagement * 0.2, // 20% retweets
    // No variance data - will use default neutral values
  });
}

// =============================================================================
// CT HEAT SCORE COMPUTATION
// =============================================================================

/**
 * Compute the Crypto Twitter (CT) Heat score (0-100).
 * Measures how much buzz a project is generating on CT.
 * 
 * @param mentionsCount - Number of mentions in the time period
 * @param avgLikes - Average likes on mentions
 * @param avgRetweets - Average retweets on mentions
 * @param uniqueAuthors - Number of unique accounts mentioning
 * @param influencerMentions - Number of mentions by high-AKARI accounts
 * @returns CT Heat score from 0 to 100
 */
export function computeCtHeatScore(
  mentionsCount: number,
  avgLikes: number,
  avgRetweets: number,
  uniqueAuthors: number,
  influencerMentions: number = 0
): number {
  // Volume component (40%)
  // Typical CT mention volume: 10-100 mentions/day for small projects, 1000+ for trending
  let volumeScore: number;
  if (mentionsCount >= 1000) {
    volumeScore = 100;
  } else if (mentionsCount >= 100) {
    volumeScore = 50 + ((mentionsCount - 100) / 900) * 50;
  } else if (mentionsCount >= 10) {
    volumeScore = 20 + ((mentionsCount - 10) / 90) * 30;
  } else {
    volumeScore = (mentionsCount / 10) * 20;
  }

  // Engagement component (30%)
  const totalEngagement = avgLikes + avgRetweets;
  let engagementScore: number;
  if (totalEngagement >= 100) {
    engagementScore = 100;
  } else if (totalEngagement >= 20) {
    engagementScore = 50 + ((totalEngagement - 20) / 80) * 50;
  } else if (totalEngagement >= 5) {
    engagementScore = 20 + ((totalEngagement - 5) / 15) * 30;
  } else {
    engagementScore = (totalEngagement / 5) * 20;
  }

  // Diversity component (20%)
  // More unique authors = more organic buzz
  let diversityScore: number;
  if (uniqueAuthors >= 100) {
    diversityScore = 100;
  } else if (uniqueAuthors >= 20) {
    diversityScore = 50 + ((uniqueAuthors - 20) / 80) * 50;
  } else {
    diversityScore = (uniqueAuthors / 20) * 50;
  }

  // Influencer component (10%)
  // Mentions by credible accounts boost the score
  let influencerScore: number;
  if (influencerMentions >= 10) {
    influencerScore = 100;
  } else if (influencerMentions >= 3) {
    influencerScore = 50 + ((influencerMentions - 3) / 7) * 50;
  } else {
    influencerScore = (influencerMentions / 3) * 50;
  }

  // Weighted combination
  const heat =
    volumeScore * 0.40 +
    engagementScore * 0.30 +
    diversityScore * 0.20 +
    influencerScore * 0.10;

  return Math.round(Math.max(0, Math.min(100, heat)));
}

// =============================================================================
// SENTIMENT AGGREGATION
// =============================================================================

/**
 * Aggregate individual tweet sentiment scores into a weighted average.
 * Weights by engagement (more engagement = more influential).
 * 
 * @param tweets - Array of tweets with sentiment and engagement
 * @returns Weighted sentiment score (0-100)
 */
export function aggregateSentimentScore(
  tweets: Array<{
    sentimentScore: number;
    likes: number;
    retweets: number;
    replies: number;
  }>
): number {
  if (tweets.length === 0) {
    return 50; // Neutral default
  }

  let totalWeight = 0;
  let weightedSum = 0;

  for (const tweet of tweets) {
    // Weight = 1 + engagement (so even zero-engagement tweets count)
    const weight = 1 + tweet.likes + tweet.retweets + tweet.replies;
    weightedSum += tweet.sentimentScore * weight;
    totalWeight += weight;
  }

  return Math.round(weightedSum / totalWeight);
}

