/**
 * Profile Components Index
 * 
 * Re-exports all profile page components for easy importing.
 */

export { ProfileHeader } from './ProfileHeader';
export type { ProfileHeaderProps } from './ProfileHeader';

export { ProfileStatsRow } from './ProfileStatsRow';
export type { ProfileStatsRowProps, MetricsChange24h, InnerCircleSummary } from './ProfileStatsRow';

export { ProfileSignalChart } from './ProfileSignalChart';
export type { ProfileSignalChartProps, MetricsDaily } from './ProfileSignalChart';

export { ProfileSocialConnections } from './ProfileSocialConnections';
export type { ProfileSocialConnectionsProps } from './ProfileSocialConnections';

export { ProfileReviews } from './ProfileReviews';
export type { ProfileReviewsProps } from './ProfileReviews';

export { ProfilePersonaSelector } from './ProfilePersonaSelector';
export type { ProfilePersonaSelectorProps } from './ProfilePersonaSelector';

// =============================================================================
// TOPIC TYPES (Zone of Expertise)
// =============================================================================

// Re-export from shared types file to avoid circular dependencies
export { PROFILE_TOPICS, type ProfileTopic, type TopicScore } from '@/lib/portal/topic-types';

/**
 * Display info for each topic (for UI rendering)
 */
export const TOPIC_DISPLAY: Record<ProfileTopic, { label: string; color: string; emoji: string }> = {
  ai: { label: 'AI & ML', color: '#8B5CF6', emoji: '🤖' },
  defi: { label: 'DeFi', color: '#10B981', emoji: '🏦' },
  nfts: { label: 'NFTs', color: '#F59E0B', emoji: '🎨' },
  news: { label: 'News', color: '#3B82F6', emoji: '📰' },
  macro: { label: 'Macro', color: '#EF4444', emoji: '🌍' },
  airdrops: { label: 'Airdrops', color: '#EC4899', emoji: '🪂' },
  memes: { label: 'Memes', color: '#FBBF24', emoji: '🐸' },
  trading: { label: 'Trading', color: '#14B8A6', emoji: '📈' },
  gaming: { label: 'Gaming', color: '#6366F1', emoji: '🎮' },
  crypto: { label: 'Crypto', color: '#F97316', emoji: '₿' },
};

// =============================================================================
// ZONE OF EXPERTISE (Radar Chart)
// =============================================================================

export { ProfileZoneOfExpertise } from './ProfileZoneOfExpertise';
export type { ProfileZoneOfExpertiseProps } from './ProfileZoneOfExpertise';

// =============================================================================
// CLUB ORBIT (Bubble Cluster)
// =============================================================================

export { ProfileClubOrbit } from './ProfileClubOrbit';
export type { ProfileClubOrbitProps, OrbitMember } from './ProfileClubOrbit';

// =============================================================================
// INNER CIRCLE LIST
// =============================================================================

export { ProfileInnerCircleList } from './ProfileInnerCircleList';
export type { ProfileInnerCircleListProps, InnerCircleEntry } from './ProfileInnerCircleList';

// =============================================================================
// ZONE ADVICE
// =============================================================================

export { ProfileZoneAdvice } from './ProfileZoneAdvice';
export type { ProfileZoneAdviceProps } from './ProfileZoneAdvice';
export { computeZoneAdvice } from './zone-advice';
export type { ZoneAdviceItem, ZoneAdviceInput } from './zone-advice';

// =============================================================================
// DEEP EXPLORER ACCESS
// =============================================================================

export { ProfileDeepExplorerAccess } from './ProfileDeepExplorerAccess';
export type { ProfileDeepExplorerAccessProps } from './ProfileDeepExplorerAccess';

