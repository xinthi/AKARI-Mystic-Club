/**
 * Social Metrics Abstraction
 *
 * Read-only metrics layer for multi-platform support.
 * Currently focuses on X, with placeholders for YouTube/Instagram/TikTok.
 */

export type SocialPlatform = 'x' | 'youtube' | 'instagram' | 'tiktok';

export interface SocialUserStats {
  handle: string;
  followers?: number | null;
  following?: number | null;
  posts?: number | null;
  engagementRate?: number | null;
  lastUpdatedAt?: string | null;
}

export interface SocialPost {
  id: string;
  url: string;
  text?: string | null;
  createdAt: string;
  likes?: number | null;
  replies?: number | null;
  reposts?: number | null;
}

export interface SocialMetricsProvider {
  fetchUserStats(platform: SocialPlatform, handle: string): Promise<SocialUserStats | null>;
  fetchRecentPosts(platform: SocialPlatform, handle: string, limit?: number): Promise<SocialPost[]>;
}

export async function fetchUserStats(
  platform: SocialPlatform,
  handle: string
): Promise<SocialUserStats | null> {
  switch (platform) {
    case 'x':
      return null;
    case 'youtube':
    case 'instagram':
    case 'tiktok':
    default:
      return null;
  }
}

export async function fetchRecentPosts(
  platform: SocialPlatform,
  handle: string,
  limit: number = 10
): Promise<SocialPost[]> {
  switch (platform) {
    case 'x':
      return [];
    case 'youtube':
    case 'instagram':
    case 'tiktok':
    default:
      return [];
  }
}
