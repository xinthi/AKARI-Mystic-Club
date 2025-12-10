/**
 * Topic Types
 * 
 * Shared type definitions for profile topics.
 * This file is separate from components to avoid circular dependencies
 * when used in API routes.
 */

/**
 * Profile topics for Zone of Expertise radar
 */
export const PROFILE_TOPICS = [
  'ai',
  'defi',
  'nfts',
  'news',
  'macro',
  'airdrops',
  'memes',
  'trading',
  'gaming',
  'crypto',
] as const;

export type ProfileTopic = (typeof PROFILE_TOPICS)[number];

/**
 * Topic score as returned by API
 */
export interface TopicScore {
  topic: ProfileTopic;
  score: number; // 0-100 normalized
  tweetCount: number;
  weightedScore: number;
}

