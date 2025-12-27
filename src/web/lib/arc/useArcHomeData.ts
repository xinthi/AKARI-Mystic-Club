/**
 * Hook for fetching ARC home page data
 * 
 * Fetches live leaderboards and notifications with proper error handling
 */

import { useState, useEffect, useCallback } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface LiveLeaderboard {
  arenaId?: string;
  arenaName?: string;
  arenaSlug?: string;
  campaignId?: string;
  projectId: string;
  projectName: string;
  projectSlug: string | null;
  xHandle: string | null;
  creatorCount: number;
  startAt: string | null;
  endAt: string | null;
  title: string;
  kind: 'arena' | 'campaign' | 'gamified';
}

export interface Notification {
  id: string;
  profile_id: string;
  type: string;
  context: Record<string, any> | null;
  is_read: boolean;
  created_at: string;
}

export interface ArcHomeData {
  liveItems: LiveLeaderboard[];
  upcomingItems: LiveLeaderboard[];
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
}

// =============================================================================
// HOOK
// =============================================================================

export function useArcHomeData(): ArcHomeData {
  const [liveItems, setLiveItems] = useState<LiveLeaderboard[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<LiveLeaderboard[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch live leaderboards
      const leaderboardsRes = await fetch('/api/portal/arc/live-leaderboards?limit=15', {
        credentials: 'include',
      });

      if (!leaderboardsRes.ok) {
        const errorData = await leaderboardsRes.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to load live leaderboards (${leaderboardsRes.status})`);
      }

      const leaderboardsData = await leaderboardsRes.json();
      if (!leaderboardsData.ok) {
        throw new Error(leaderboardsData.error || 'Failed to load live leaderboards');
      }

      setLiveItems(leaderboardsData.leaderboards || []);
      setUpcomingItems(leaderboardsData.upcoming || []);

      // Fetch notifications
      const notificationsRes = await fetch('/api/portal/notifications?limit=20&offset=0', {
        credentials: 'include',
      });

      // Notifications are optional - if they fail, continue without them
      if (notificationsRes.ok) {
        const notificationsData = await notificationsRes.json();
        if (notificationsData.ok) {
          setNotifications(notificationsData.notifications || []);
          setUnreadCount(notificationsData.unreadCount || 0);
        }
      }
    } catch (err: any) {
      console.error('[ARC Home] Data fetch error:', err);
      setError(err.message || 'Failed to load data');
      // On error, set empty arrays but don't break the page
      setLiveItems([]);
      setUpcomingItems([]);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    liveItems,
    upcomingItems,
    notifications,
    unreadCount,
    loading,
    error,
  };
}

