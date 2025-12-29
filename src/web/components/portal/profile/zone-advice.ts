/**
 * Zone Advice Helper
 * 
 * Computes practical advice based on the user's topic scores and inner circle data.
 * Uses heuristics only - no AI calls.
 */

import type { TopicScore, InnerCircleEntry } from './index';
import { TOPIC_DISPLAY, ProfileTopic } from './index';

// =============================================================================
// TYPES
// =============================================================================

export interface ZoneAdviceItem {
  type: 'strength' | 'opportunity' | 'alignment';
  title: string;
  description: string;
}

export interface ZoneAdviceInput {
  topics: TopicScore[];
  innerCircle: InnerCircleEntry[];
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get display name for a topic
 */
function getTopicDisplayName(topic: ProfileTopic): string {
  return TOPIC_DISPLAY[topic]?.label || topic;
}

/**
 * Format a list of topic names for display
 */
function formatTopicList(topics: ProfileTopic[]): string {
  const names = topics.map(getTopicDisplayName);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * Calculate median of an array of numbers
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Compute personalized zone advice based on topic scores and inner circle data.
 * Returns up to 3-4 advice items.
 */
export function computeZoneAdvice(input: ZoneAdviceInput): ZoneAdviceItem[] {
  const { topics, innerCircle } = input;
  const advice: ZoneAdviceItem[] = [];
  
  // Filter and sort non-zero topics
  const activeTopics = topics
    .filter(t => t.score > 0)
    .sort((a, b) => b.score - a.score);
  
  const hasActiveTopics = activeTopics.length > 0;
  const hasInnerCircle = innerCircle.length > 0;
  
  // ==========================================================================
  // Edge case: No data at all
  // ==========================================================================
  if (!hasActiveTopics && !hasInnerCircle) {
    return [{
      type: 'opportunity',
      title: 'Start shaping your Zone',
      description: 'Post more consistently around 1–2 themes so Akari can map your Zone of Expertise and recommend better connections.',
    }];
  }
  
  // ==========================================================================
  // 1. Identify strong topics (top 2-3)
  // ==========================================================================
  if (hasActiveTopics) {
    const strongTopics = activeTopics.slice(0, 3);
    const strongTopicNames = strongTopics.map(t => t.topic);
    
    if (strongTopics.length >= 2) {
      // Multiple strong topics
      advice.push({
        type: 'strength',
        title: 'Double down on your strengths',
        description: `Your content around ${formatTopicList(strongTopicNames.slice(0, 2))} resonates well. Keep producing high-quality posts in these lanes - your audience expects it.`,
      });
    } else if (strongTopics.length === 1) {
      // Single dominant topic
      advice.push({
        type: 'strength',
        title: `You're the ${getTopicDisplayName(strongTopics[0].topic)} voice`,
        description: `${getTopicDisplayName(strongTopics[0].topic)} is clearly your strongest lane. Consider going deeper with threads, explainers, or hot takes to cement your position.`,
      });
    }
  }
  
  // ==========================================================================
  // 2. Identify weak but active topics (opportunity)
  // ==========================================================================
  if (activeTopics.length >= 4) {
    const scores = activeTopics.map(t => t.score);
    const medianScore = median(scores);
    
    // Topics below median but still active
    const weakTopics = activeTopics
      .filter(t => t.score < medianScore && t.score > 0)
      .slice(0, 2);
    
    if (weakTopics.length > 0) {
      const weakTopicNames = weakTopics.map(t => t.topic);
      advice.push({
        type: 'opportunity',
        title: 'Refine your secondary lanes',
        description: `You tweet about ${formatTopicList(weakTopicNames)}, but engagement underperforms vs your main lanes. Try fewer low-effort posts and more thoughtful takes when you touch these topics.`,
      });
    }
  } else if (activeTopics.length > 0 && activeTopics.length < 3) {
    // Very narrow focus - suggest expansion
    const topTopic = activeTopics[0].topic;
    advice.push({
      type: 'opportunity',
      title: 'Expand your reach',
      description: `You're focused mainly on ${getTopicDisplayName(topTopic)}. Consider adjacent topics to grow your audience - cross-pollination often brings new followers.`,
    });
  }
  
  // ==========================================================================
  // 3. Inner circle alignment advice
  // ==========================================================================
  if (hasInnerCircle) {
    const heroCount = innerCircle.filter(e => e.role === 'hero').length;
    const playerCount = innerCircle.filter(e => e.role === 'player').length;
    
    if (heroCount > 0 && hasActiveTopics) {
      // User has heroes in their inner circle - suggest collaboration
      const topTopics = activeTopics.slice(0, 2).map(t => t.topic);
      advice.push({
        type: 'alignment',
        title: 'Leverage your hero connections',
        description: `Your strongest allies seem to do well in ${formatTopicList(topTopics)}. Consider co-signing their threads or quote-tweeting their best posts with your unique angle.`,
      });
    } else if (playerCount > 0 && hasActiveTopics) {
      // Only players - suggest mentorship angle
      advice.push({
        type: 'alignment',
        title: 'Build your crew',
        description: `You have ${playerCount} allies at similar levels. Engage with their content - mutual support compounds over time and builds genuine community.`,
      });
    } else if (hasInnerCircle && !hasActiveTopics) {
      // Has circle but no topics
      advice.push({
        type: 'alignment',
        title: 'Your network is ready',
        description: `You've built connections with ${innerCircle.length} accounts. Now focus your content around specific themes to give them something to amplify.`,
      });
    }
  }
  
  // ==========================================================================
  // 4. General advice if we still have room
  // ==========================================================================
  if (advice.length < 3 && hasActiveTopics && activeTopics.length >= 2) {
    // Check for topic diversity
    const topScore = activeTopics[0].score;
    const secondScore = activeTopics[1].score;
    const scoreGap = topScore - secondScore;
    
    if (scoreGap > 40) {
      // Very dominant in one topic
      advice.push({
        type: 'opportunity',
        title: 'Diversify for resilience',
        description: `You're heavily weighted toward ${getTopicDisplayName(activeTopics[0].topic)}. Narrative shifts happen fast - having a secondary lane protects against audience churn.`,
      });
    }
  }
  
  // Return max 4 items
  return advice.slice(0, 4);
}

