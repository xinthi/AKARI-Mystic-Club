/**
 * Creator Signal Score Calculation
 * 
 * ⚠️ CONFIDENTIAL - SERVER-SIDE ONLY ⚠️
 * 
 * This module calculates signal score for creators in ARC leaderboards,
 * rewarding signal and penalizing farming.
 * 
 * DO NOT import this file in any client-side/browser code.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CreatorPostMetrics {
  tweetId: string;
  engagementPoints: number; // likes + replies*2 + retweets*3
  createdAt: Date;
  contentType: 'thread' | 'analysis' | 'meme' | 'quote_rt' | 'retweet' | 'reply' | 'other';
  isOriginal: boolean; // Not a duplicate
  sentimentScore: number | null; // 0-100
  smartScore: number | null; // Creator's smart score (0-1)
  audienceOrgScore: number | null; // Audience organic score (0-100)
}

export interface CreatorSignalResult {
  final_score: number;
  signal_score: number; // 0-100 derived score
  trust_band: 'A' | 'B' | 'C' | 'D';
  smart_followers_count: number;
}

// =============================================================================
// CONFIGURATION (from env vars - safe fallbacks)
// =============================================================================

// Recency half-lives (hours)
const RECENCY_HALFLIFE_24H = parseFloat(process.env.SIGNAL_RECENCY_HALFLIFE_24H || '12');
const RECENCY_HALFLIFE_7D = parseFloat(process.env.SIGNAL_RECENCY_HALFLIFE_7D || '84');
const RECENCY_HALFLIFE_30D = parseFloat(process.env.SIGNAL_RECENCY_HALFLIFE_30D || '360');

// Content type weights
const CONTENT_WEIGHT_THREAD = parseFloat(process.env.SIGNAL_CONTENT_WEIGHT_THREAD || '2.0');
const CONTENT_WEIGHT_ANALYSIS = parseFloat(process.env.SIGNAL_CONTENT_WEIGHT_ANALYSIS || '1.8');
const CONTENT_WEIGHT_MEME = parseFloat(process.env.SIGNAL_CONTENT_WEIGHT_MEME || '0.8');
const CONTENT_WEIGHT_QUOTE_RT = parseFloat(process.env.SIGNAL_CONTENT_WEIGHT_QUOTE_RT || '1.0');
const CONTENT_WEIGHT_RETWEET = parseFloat(process.env.SIGNAL_CONTENT_WEIGHT_RETWEET || '0.3');
const CONTENT_WEIGHT_REPLY = parseFloat(process.env.SIGNAL_CONTENT_WEIGHT_REPLY || '0.5');

// Multiplier bounds
const AUTH_WEIGHT_FLOOR = parseFloat(process.env.SIGNAL_AUTH_WEIGHT_FLOOR || '0.5');
const AUTH_WEIGHT_CAP = parseFloat(process.env.SIGNAL_AUTH_WEIGHT_CAP || '2.0');
const SENTIMENT_WEIGHT_FLOOR = parseFloat(process.env.SIGNAL_SENTIMENT_WEIGHT_FLOOR || '0.7');
const SENTIMENT_WEIGHT_CAP = parseFloat(process.env.SIGNAL_SENTIMENT_WEIGHT_CAP || '1.3');
const JOIN_WEIGHT_MAX = parseFloat(process.env.SIGNAL_JOIN_WEIGHT_MAX || '1.5');

// Trust band thresholds
const TRUST_BAND_A_MIN = parseFloat(process.env.SIGNAL_TRUST_BAND_A_MIN || '80');
const TRUST_BAND_B_MIN = parseFloat(process.env.SIGNAL_TRUST_BAND_B_MIN || '60');
const TRUST_BAND_C_MIN = parseFloat(process.env.SIGNAL_TRUST_BAND_C_MIN || '40');

// =============================================================================
// HELPERS
// =============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate recency weight using exponential decay
 */
function recencyWeight(
  tweetAgeHours: number,
  halfLifeHours: number
): number {
  return Math.exp(-(tweetAgeHours / halfLifeHours) * Math.LN2);
}

/**
 * Get content type weight
 */
function contentWeight(contentType: CreatorPostMetrics['contentType']): number {
  switch (contentType) {
    case 'thread':
      return CONTENT_WEIGHT_THREAD;
    case 'analysis':
      return CONTENT_WEIGHT_ANALYSIS;
    case 'meme':
      return CONTENT_WEIGHT_MEME;
    case 'quote_rt':
      return CONTENT_WEIGHT_QUOTE_RT;
    case 'retweet':
      return CONTENT_WEIGHT_RETWEET;
    case 'reply':
      return CONTENT_WEIGHT_REPLY;
    default:
      return 1.0;
  }
}

/**
 * Calculate authenticity weight from smart score and audience org
 */
function authWeight(
  smartScore: number | null,
  audienceOrgScore: number | null
): number {
  const smart = smartScore !== null ? smartScore : 0.5; // Default to neutral
  const org = audienceOrgScore !== null ? audienceOrgScore / 100 : 0.5; // Default to neutral
  
  // Combined authenticity score
  const combined = (smart * 0.6) + (org * 0.4);
  
  return clamp(combined * 2, AUTH_WEIGHT_FLOOR, AUTH_WEIGHT_CAP);
}

/**
 * Calculate sentiment weight
 */
function sentimentWeight(sentimentScore: number | null): number {
  if (sentimentScore === null) {
    return 1.0; // Neutral if unknown
  }
  
  // Map 0-100 sentiment to 0.7-1.3 multiplier
  const normalized = sentimentScore / 100;
  const weight = 0.7 + (normalized * 0.6);
  
  return clamp(weight, SENTIMENT_WEIGHT_FLOOR, SENTIMENT_WEIGHT_CAP);
}

// =============================================================================
// MAIN: Calculate Signal Score
// =============================================================================

/**
 * Calculate creator signal score from post metrics
 * 
 * @param posts - Array of post metrics for the creator
 * @param window - Time window ('24h', '7d', '30d')
 * @param isJoined - Whether creator joined the leaderboard
 * @param smartFollowersCount - Smart followers count
 * @returns Signal score result
 */
export function calculateCreatorSignalScore(
  posts: CreatorPostMetrics[],
  window: '24h' | '7d' | '30d' = '7d',
  isJoined: boolean = false,
  smartFollowersCount: number = 0
): CreatorSignalResult {
  if (posts.length === 0) {
    return {
      final_score: 0,
      signal_score: 0,
      trust_band: 'D',
      smart_followers_count: smartFollowersCount,
    };
  }

  const now = Date.now();
  const halfLife = window === '24h' 
    ? RECENCY_HALFLIFE_24H 
    : window === '7d' 
    ? RECENCY_HALFLIFE_7D 
    : RECENCY_HALFLIFE_30D;

  let totalPoints = 0;

  for (const post of posts) {
    // Calculate tweet age in hours
    const tweetAge = (now - post.createdAt.getTime()) / (1000 * 60 * 60);
    
    // Recency weight
    const recency = recencyWeight(tweetAge, halfLife);
    
    // Content weight
    const content = contentWeight(post.contentType);
    
    // Originality weight (penalty for duplicates)
    const originality = post.isOriginal ? 1.0 : 0.3;
    
    // Authenticity weight
    const auth = authWeight(post.smartScore, post.audienceOrgScore);
    
    // Sentiment weight
    const sentiment = sentimentWeight(post.sentimentScore);
    
    // Join weight (bonus for joined creators)
    const join = isJoined ? JOIN_WEIGHT_MAX : 1.0;
    
    // Calculate post points
    const postPoints = 
      Math.log1p(post.engagementPoints) *
      recency *
      content *
      originality *
      auth *
      sentiment *
      join;
    
    totalPoints += postPoints;
  }

  // Final score
  const finalScore = Math.round(totalPoints * 100) / 100;

  // Derive signal score (0-100)
  // Normalize based on typical ranges (this would be tuned in production)
  const signalScore = Math.min(100, Math.max(0, (finalScore / 10) * 10));

  // Determine trust band
  let trustBand: 'A' | 'B' | 'C' | 'D';
  if (signalScore >= TRUST_BAND_A_MIN) {
    trustBand = 'A';
  } else if (signalScore >= TRUST_BAND_B_MIN) {
    trustBand = 'B';
  } else if (signalScore >= TRUST_BAND_C_MIN) {
    trustBand = 'C';
  } else {
    trustBand = 'D';
  }

  return {
    final_score: finalScore,
    signal_score: Math.round(signalScore),
    trust_band: trustBand,
    smart_followers_count: smartFollowersCount,
  };
}

