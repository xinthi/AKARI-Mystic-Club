/**
 * Sentiment System Configuration
 * 
 * Centralized configuration for all sentiment-related processing.
 * All values can be overridden via environment variables.
 * 
 * Usage:
 *   import { SENTIMENT_CONFIG } from '@/server/config/sentiment.config';
 */

// =============================================================================
// HELPER
// =============================================================================

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// =============================================================================
// SENTIMENT PROCESSING LIMITS
// =============================================================================

export const SENTIMENT_CONFIG = {
  /**
   * Twitter API limits for sentiment processing
   */
  twitter: {
    /** Max tweets to fetch from project's timeline (default: 20) */
    maxTweets: getEnvNumber('SENTIMENT_MAX_TWEETS', 20),
    
    /** Max mentions to fetch (tweets mentioning the project) (default: 100) */
    maxMentions: getEnvNumber('SENTIMENT_MAX_MENTIONS', 100),
    
    /** Max followers to fetch for quality sampling (default: 30) */
    maxFollowerSample: getEnvNumber('SENTIMENT_MAX_FOLLOWER_SAMPLE', 30),
  },

  /**
   * Cron job / batch processing limits (more conservative for daily runs)
   */
  cron: {
    /** Max tweets for cron job processing (default: 10) */
    maxTweets: getEnvNumber('CRON_MAX_TWEETS', 10),
    
    /** Max mentions for cron job processing (default: 30) */
    maxMentions: getEnvNumber('CRON_MAX_MENTIONS', 30),
    
    /** Delay between projects in ms (default: 2000) */
    delayBetweenProjectsMs: getEnvNumber('CRON_DELAY_BETWEEN_PROJECTS_MS', 2000),
    
    /** Delay between API calls in ms (default: 500) */
    delayBetweenApiCallsMs: getEnvNumber('CRON_DELAY_BETWEEN_API_CALLS_MS', 500),
  },

  /**
   * Inner circle processing limits
   */
  innerCircle: {
    /** Max followers to fetch per project (default: 500) */
    maxFollowersToFetch: getEnvNumber('INNER_CIRCLE_MAX_FOLLOWERS', 500),
    
    /** Max inner circle members per project (default: 100) */
    maxInnerCircleSize: getEnvNumber('INNER_CIRCLE_MAX_SIZE', 100),
    
    /** Minimum followers for IC qualification (default: 200) */
    minFollowersForQualification: getEnvNumber('INNER_CIRCLE_MIN_FOLLOWERS', 200),
    
    /** Maximum farm risk score for IC qualification (default: 50) */
    maxFarmRiskScore: getEnvNumber('INNER_CIRCLE_MAX_FARM_RISK', 50),
    
    /** Delay between projects in ms (default: 3000) */
    delayBetweenProjectsMs: getEnvNumber('INNER_CIRCLE_DELAY_MS', 3000),
  },

  /**
   * Smart refresh algorithm thresholds
   */
  smartRefresh: {
    /** Interest score threshold for daily refresh (default: 5) */
    dailyThreshold: getEnvNumber('SMART_REFRESH_DAILY_THRESHOLD', 5),
    
    /** Interest score threshold for 3-day refresh (default: 1) */
    threeDaysThreshold: getEnvNumber('SMART_REFRESH_3DAY_THRESHOLD', 1),
    
    /** Inactivity penalty: -1 point per N days (default: 5) */
    inactivityPenaltyDays: getEnvNumber('SMART_REFRESH_INACTIVITY_PENALTY_DAYS', 5),
  },

  /**
   * KOL detection thresholds
   */
  kol: {
    /** Engagement threshold for KOL detection (likes + retweets*2) (default: 20) */
    engagementThreshold: getEnvNumber('KOL_ENGAGEMENT_THRESHOLD', 20),
  },
} as const;

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type SentimentConfig = typeof SENTIMENT_CONFIG;

/**
 * Run options type for sentiment processing
 */
export interface SentimentRunOptions {
  /** Max tweets to fetch from the project's timeline */
  maxTweets?: number;
  /** Max mentions to fetch (tweets mentioning the project) */
  maxMentions?: number;
}

/**
 * Run options type for inner circle processing
 */
export interface InnerCircleRunOptions {
  /** Max followers to fetch from Twitter API */
  maxFollowersToFetch?: number;
  /** Max inner circle members to select */
  maxInnerCircleSize?: number;
}

// =============================================================================
// EXPORT DEFAULTS FOR BACKWARDS COMPATIBILITY
// =============================================================================

/** @deprecated Use SENTIMENT_CONFIG.cron.maxTweets instead */
export const DEFAULT_MAX_TWEETS = SENTIMENT_CONFIG.cron.maxTweets;

/** @deprecated Use SENTIMENT_CONFIG.cron.maxMentions instead */
export const DEFAULT_MAX_MENTIONS = SENTIMENT_CONFIG.cron.maxMentions;

/** @deprecated Use SENTIMENT_CONFIG.cron.delayBetweenProjectsMs instead */
export const DELAY_BETWEEN_PROJECTS_MS = SENTIMENT_CONFIG.cron.delayBetweenProjectsMs;

/** @deprecated Use SENTIMENT_CONFIG.cron.delayBetweenApiCallsMs instead */
export const DELAY_BETWEEN_API_CALLS_MS = SENTIMENT_CONFIG.cron.delayBetweenApiCallsMs;

