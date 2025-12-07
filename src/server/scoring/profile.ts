/**
 * Profile Scoring Module
 * 
 * ⚠️ CONFIDENTIAL - SERVER-SIDE ONLY ⚠️
 * 
 * This module contains proprietary scoring algorithms.
 * DO NOT import this file in any client-side/browser code.
 * Only use in: scripts/, API routes (server functions), cron jobs.
 * 
 * Implements the AKARI Profile Score algorithm (0-1000).
 */

import {
  unifiedGetUserInfo,
  unifiedGetUserLastTweets,
  unifiedGetUserFollowers,
  unifiedGetUserVerifiedFollowers,
  unifiedGetTweetRetweeters,
  unifiedGetTweetReplies,
  UnifiedUserProfile,
  UnifiedTweet,
} from '../twitterClient';
import { analyzeSentiments } from '../sentiment/localAnalyzer';

// =============================================================================
// TYPES
// =============================================================================

export interface ProfileScoreResult {
  authenticityScore: number;       // 0-100
  influenceScore: number;          // 0-100
  signalDensityScore: number;      // 0-100
  farmRiskScore: number;           // 0-100
  akariProfileScore: number;       // 0-1000
  
  // Metadata
  engagementRate: number;
  followerQualityRatio: number;
  retweetRatio: number;
  signalRatio: number;
  farmingRatio: number;
}

export interface ProfileData {
  user: UnifiedUserProfile;
  tweets: UnifiedTweet[];
  followersSample: UnifiedUserProfile[];
  verifiedFollowers: UnifiedUserProfile[];
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate engagement rate from tweets and follower count
 */
function calculateEngagementRate(tweets: UnifiedTweet[], followers: number): number {
  if (tweets.length === 0 || followers === 0) return 0;
  
  const totalEngagement = tweets.reduce((sum, t) => {
    return sum + t.likeCount + t.retweetCount + t.replyCount + t.quoteCount;
  }, 0);
  
  return totalEngagement / tweets.length / followers;
}

/**
 * Calculate ratio of retweets in tweet list
 */
function calculateRetweetRatio(tweets: UnifiedTweet[]): number {
  if (tweets.length === 0) return 0;
  const rtCount = tweets.filter(t => t.isRetweet).length;
  return rtCount / tweets.length;
}

/**
 * Classify tweet content into categories
 */
function classifyTweet(tweet: UnifiedTweet, sentimentScore?: number): {
  isSignalAnalysis: boolean;
  isProjectUpdate: boolean;
  isAirdropFarming: boolean;
  isPureShill: boolean;
  isRetweetOnly: boolean;
  isMemeNoise: boolean;
} {
  const text = tweet.text.toLowerCase();
  
  // Farming patterns
  const farmingKeywords = [
    'airdrop', 'giveaway', 'whitelist', 'wl spot', 'rt to enter',
    'retweet to win', 'tag 3 friends', 'follow + rt', 'quest',
    'claim now', 'free mint', 'guaranteed', 'tag friends'
  ];
  const isAirdropFarming = farmingKeywords.some(kw => text.includes(kw));
  
  // Pure shill patterns
  const shillKeywords = [
    'use my code', 'referral', 'sign up with', 'affiliate',
    '🚀🚀🚀', 'buy now', 'don\'t miss out', 'last chance',
    '100x gem', '1000x', 'not financial advice'
  ];
  const isPureShill = shillKeywords.some(kw => text.includes(kw));
  
  // Signal analysis patterns (threads, insights)
  const signalPatterns = [
    'thread', '1/', '🧵', 'let me explain', 'here\'s why',
    'analysis', 'breakdown', 'deep dive', 'research',
    'data shows', 'on-chain', 'metrics', 'fundamentals'
  ];
  const isSignalAnalysis = signalPatterns.some(p => text.includes(p)) || 
    (tweet.text.length > 200 && sentimentScore !== undefined && sentimentScore > 60);
  
  // Project update patterns (from official accounts)
  const updatePatterns = [
    'announcing', 'launched', 'update:', 'v2', 'mainnet',
    'partnership', 'integration', 'milestone', 'roadmap'
  ];
  const isProjectUpdate = updatePatterns.some(p => text.includes(p));
  
  // Meme/noise patterns
  const noisePatterns = ['gm', 'gn', 'wagmi', 'wen', '😂', '🤣'];
  const isMemeNoise = noisePatterns.some(p => text.includes(p)) && 
    tweet.text.length < 50 && !isSignalAnalysis;
  
  // Retweet only
  const isRetweetOnly = tweet.isRetweet;
  
  return {
    isSignalAnalysis,
    isProjectUpdate,
    isAirdropFarming,
    isPureShill,
    isRetweetOnly,
    isMemeNoise,
  };
}

// =============================================================================
// SCORE COMPUTATION
// =============================================================================

/**
 * Compute AUTHENTICITY_SCORE (0-100)
 * 
 * Factors:
 * - Low engagement rate for high follower accounts (bot indicator)
 * - Poor follower quality ratio (fake followers)
 * - High retweet ratio (no original content)
 * - Young account age (new accounts are less trustworthy)
 */
export function computeAuthenticityScore(
  followers: number,
  engagementRate: number,
  followerQualityRatio: number,
  retweetRatio: number,
  accountAgeDays: number
): number {
  let score = 100;
  
  // Penalty for low engagement on large accounts
  // If followers > 100k and engagement_rate < 0.05%, subtract up to 40
  if (followers > 100000) {
    const expectedMinEngagement = 0.0005; // 0.05%
    if (engagementRate < expectedMinEngagement) {
      const penalty = (1 - engagementRate / expectedMinEngagement) * 40;
      score -= penalty;
    }
  }
  
  // Penalty for low follower quality
  // If quality ratio < 40%, subtract up to 30
  if (followerQualityRatio < 0.4) {
    const penalty = (1 - followerQualityRatio / 0.4) * 30;
    score -= penalty;
  }
  
  // Penalty for high retweet ratio
  // If > 80% retweets, subtract up to 10
  if (retweetRatio > 0.8) {
    const penalty = Math.min(10, (retweetRatio - 0.8) / 0.2 * 10);
    score -= penalty;
  }
  
  // Penalty for new accounts
  // If < 90 days old, subtract up to 10
  if (accountAgeDays < 90) {
    const penalty = (1 - accountAgeDays / 90) * 10;
    score -= penalty;
  }
  
  return clamp(Math.round(score), 0, 100);
}

/**
 * Compute INFLUENCE_SCORE (0-100)
 * 
 * Factors:
 * - Follower count (log scale)
 * - Verification status (blue check)
 * - High profile followers (verified followers)
 */
export function computeInfluenceScore(
  followers: number,
  isVerified: boolean,
  highProfileFollowerCount: number
): number {
  // Follower component (0-70 points)
  // Uses log10 scale: 1M followers = 60 (log10(1M+1)/6 * 70 ≈ 70)
  const followerScore = Math.min(1, Math.log10(followers + 1) / 6) * 70;
  
  // Verification bonus (0-10 points)
  const verifiedBonus = isVerified ? 10 : 0;
  
  // High profile followers bonus (0-20 points)
  // 2 points per verified follower, up to 20
  const hpBonus = Math.min(20, highProfileFollowerCount * 2);
  
  return clamp(Math.round(followerScore + verifiedBonus + hpBonus), 0, 100);
}

/**
 * Compute SIGNAL_DENSITY_SCORE (0-100)
 * 
 * Factors:
 * - Signal ratio (threads, analysis, insights)
 * - Farming ratio (airdrop, giveaway content)
 * - Shill ratio (affiliate, referral content)
 * - Retweet ratio (too many retweets = low signal)
 */
export function computeSignalDensityScore(
  signalRatio: number,
  farmingRatio: number,
  shillRatio: number,
  retweetRatio: number
): number {
  let score = 0;
  
  // Signal content adds points (up to 100)
  score += signalRatio * 100;
  
  // Farming content subtracts heavily
  score -= farmingRatio * 60;
  
  // Shill content subtracts moderately
  score -= shillRatio * 40;
  
  // Excess retweets subtract (only penalize if > 50%)
  if (retweetRatio > 0.5) {
    score -= (retweetRatio - 0.5) * 40;
  }
  
  return clamp(Math.round(score), 0, 100);
}

/**
 * Compute FARM_RISK_SCORE (0-100)
 * 
 * Detects farming pods by analyzing:
 * - Overlap ratio: Same accounts engaging across multiple tweets
 * - Low quality ratio: Engagement from accounts with few followers
 * - Suspicious engagement patterns
 */
export async function computeFarmRiskScore(
  tweets: UnifiedTweet[],
  engagementRate: number,
  followers: number
): Promise<number> {
  // Take top K tweets by engagement
  const topTweets = [...tweets]
    .sort((a, b) => (b.likeCount + b.retweetCount) - (a.likeCount + a.retweetCount))
    .slice(0, 5);
  
  if (topTweets.length < 2) {
    return 0; // Not enough data to compute farm risk
  }
  
  let farmRisk = 0;
  
  // Simplified farm risk based on engagement patterns
  // Suspicious: very high engagement rate for small accounts
  if (engagementRate > 0.05 && followers < 5000) {
    farmRisk += 20;
  }
  
  // Suspicious: suspiciously consistent engagement numbers
  const engagementVariance = calculateEngagementVariance(tweets);
  if (engagementVariance < 0.1 && tweets.length > 10) {
    farmRisk += 15; // Low variance suggests artificial engagement
  }
  
  // TODO: Implement full overlap analysis when API rate limits allow
  // For now, use heuristics based on tweet patterns
  
  return clamp(Math.round(farmRisk), 0, 100);
}

/**
 * Calculate variance in engagement across tweets
 */
function calculateEngagementVariance(tweets: UnifiedTweet[]): number {
  if (tweets.length < 2) return 1;
  
  const engagements = tweets.map(t => t.likeCount + t.retweetCount + t.replyCount);
  const mean = engagements.reduce((a, b) => a + b, 0) / engagements.length;
  
  if (mean === 0) return 1;
  
  const variance = engagements.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) / engagements.length;
  const cv = Math.sqrt(variance) / mean; // Coefficient of variation
  
  return cv;
}

/**
 * Compute the final AKARI Profile Score (0-1000)
 */
export function computeAkariProfileScore(
  authenticityScore: number,
  signalDensityScore: number,
  influenceScore: number,
  farmRiskScore: number
): number {
  // Adjust authenticity by farm risk
  const authFinal = authenticityScore * (1 - farmRiskScore * 0.5 / 100);
  
  // Weighted average
  const score0to100 = 
    0.35 * authFinal +
    0.35 * signalDensityScore +
    0.30 * influenceScore;
  
  // Scale to 0-1000
  return clamp(Math.round(score0to100 * 10), 0, 1000);
}

// =============================================================================
// MAIN SCORING FUNCTION
// =============================================================================

/**
 * Score a Twitter profile by username
 * 
 * This is the main entry point for profile scoring.
 * It fetches all necessary data and computes all score components.
 */
export async function scoreProfile(username: string): Promise<ProfileScoreResult | null> {
  try {
    // 1. Fetch base user data
    const user = await unifiedGetUserInfo(username);
    if (!user) {
      console.error(`[Profile Scoring] User not found: ${username}`);
      return null;
    }
    
    // 2. Fetch tweets (last 50)
    const tweets = await unifiedGetUserLastTweets(username, 50);
    
    // 3. Fetch follower sample
    const followersSample = await unifiedGetUserFollowers(username, 100);
    
    // 4. Fetch verified followers
    const verifiedFollowers = await unifiedGetUserVerifiedFollowers(username, 50);
    
    // 5. Calculate base metrics
    const engagementRate = calculateEngagementRate(tweets, user.followers);
    const retweetRatio = calculateRetweetRatio(tweets);
    
    // 6. Calculate follower quality ratio
    // High quality = followers >= 200 or verified
    const qualityFollowers = followersSample.filter(f => 
      f.followers >= 200 || f.isVerified
    );
    const followerQualityRatio = followersSample.length > 0 
      ? qualityFollowers.length / followersSample.length 
      : 0.5; // Default assumption
    
    // 7. Calculate account age
    const createdDate = user.createdAt ? new Date(user.createdAt) : new Date();
    const accountAgeDays = Math.floor(
      (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // 8. Classify tweets and calculate ratios
    const classifications = tweets.map(t => classifyTweet(t));
    const signalCount = classifications.filter(c => c.isSignalAnalysis || c.isProjectUpdate).length;
    const farmingCount = classifications.filter(c => c.isAirdropFarming).length;
    const shillCount = classifications.filter(c => c.isPureShill).length;
    
    const totalTweets = tweets.length || 1;
    const signalRatio = signalCount / totalTweets;
    const farmingRatio = farmingCount / totalTweets;
    const shillRatio = shillCount / totalTweets;
    
    // 9. Compute individual scores
    const authenticityScore = computeAuthenticityScore(
      user.followers,
      engagementRate,
      followerQualityRatio,
      retweetRatio,
      accountAgeDays
    );
    
    const influenceScore = computeInfluenceScore(
      user.followers,
      user.isVerified,
      verifiedFollowers.length
    );
    
    const signalDensityScore = computeSignalDensityScore(
      signalRatio,
      farmingRatio,
      shillRatio,
      retweetRatio
    );
    
    const farmRiskScore = await computeFarmRiskScore(tweets, engagementRate, user.followers);
    
    // 10. Compute final AKARI Profile Score
    const akariProfileScore = computeAkariProfileScore(
      authenticityScore,
      signalDensityScore,
      influenceScore,
      farmRiskScore
    );
    
    return {
      authenticityScore,
      influenceScore,
      signalDensityScore,
      farmRiskScore,
      akariProfileScore,
      engagementRate,
      followerQualityRatio,
      retweetRatio,
      signalRatio,
      farmingRatio,
    };
  } catch (error) {
    console.error(`[Profile Scoring] Error scoring ${username}:`, error);
    return null;
  }
}

/**
 * Map AKARI Profile Score to tier name
 */
export function mapProfileScoreToTier(score: number): {
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

