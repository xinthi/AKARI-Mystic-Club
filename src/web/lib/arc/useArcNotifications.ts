/**
 * Hook for fetching ARC notifications as activity feed
 * 
 * Fetches /api/portal/notifications and maps to activity rows
 */

import { useState, useEffect, useCallback } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface ActivityRow {
  id: string;
  title: string;
  subtitle: string | null;
  timestamp: Date;
  type: string;
}

export interface ArcNotificationsData {
  activities: ActivityRow[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function deriveActivityTitle(type: string, context: Record<string, any> | null): string {
  if (!context) {
    return 'Activity update';
  }

  // Try to extract meaningful title from context
  if (context.message) {
    return String(context.message);
  }
  if (context.text) {
    return String(context.text);
  }
  if (context.title) {
    return String(context.title);
  }

  // Fallback to type-based title
  const typeMap: Record<string, string> = {
    'mission_completed': 'Mission completed',
    'level_up': 'Level up',
    'campaign_started': 'Campaign started',
    'arena_joined': 'Arena joined',
    'points_earned': 'Points earned',
  };

  return typeMap[type] || 'New activity';
}

function deriveActivitySubtitle(type: string, context: Record<string, any> | null): string | null {
  if (!context) return null;

  // Extract subtitle from context if available
  if (context.subtitle) return String(context.subtitle);
  if (context.description) return String(context.description);
  if (context.details) return String(context.details);

  return null;
}

// =============================================================================
// HOOK
// =============================================================================

export function useArcNotifications(): ArcNotificationsData {
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/portal/notifications?limit=20&offset=0', {
        credentials: 'include',
      });

      // Notifications are optional - if they fail, continue with empty state
      if (!res.ok) {
        setActivities([]);
        setUnreadCount(0);
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (!data.ok) {
        setActivities([]);
        setUnreadCount(0);
        setLoading(false);
        return;
      }

      const notifications = data.notifications || [];
      const mappedActivities: ActivityRow[] = notifications.map((notif: any) => ({
        id: notif.id,
        title: deriveActivityTitle(notif.type, notif.context),
        subtitle: deriveActivitySubtitle(notif.type, notif.context),
        timestamp: new Date(notif.created_at),
        type: notif.type,
      }));

      setActivities(mappedActivities);
      setUnreadCount(data.unreadCount || 0);
    } catch (err: any) {
      console.error('[ARC Notifications] Fetch error:', err);
      // Don't set error for notifications - it's optional
      setActivities([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    activities,
    unreadCount,
    loading,
    error: null, // Don't expose errors for notifications
  };
}

