/**
 * Hook for fetching and normalizing ARC live leaderboard items
 * 
 * Fetches /api/portal/arc/live-leaderboards and normalizes into a consistent LiveItem shape
 */

import { useState, useEffect, useCallback } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface LiveItem {
  id: string;
  kind: 'arena' | 'campaign' | 'gamified' | 'crm';
  title: string;
  project: {
    id: string;
    name: string;
    slug: string | null;
    xHandle: string | null;
    accessLevel?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' | null;
  };
  creatorCount: number;
  startAt: string | null;
  endAt: string | null;
  statusLabel: 'Live' | 'Upcoming' | 'Paused' | 'Ended';
  // Additional fields for routing
  arenaId?: string;
  arenaSlug?: string;
  campaignId?: string;
}

export interface ArcLiveItemsData {
  liveItems: LiveItem[];
  upcomingItems: LiveItem[];
  allItems: LiveItem[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// =============================================================================
// HOOK
// =============================================================================

export function useArcLiveItems(): ArcLiveItemsData {
  const [liveItems, setLiveItems] = useState<LiveItem[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<LiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const normalizeItem = useCallback((item: any): LiveItem => {
    const id = item.arenaId || item.campaignId || item.programId || item.projectId;
    const now = Date.now();
    const startAt = item.startAt ? new Date(item.startAt).getTime() : null;
    const endAt = item.endAt ? new Date(item.endAt).getTime() : null;
    
    // Determine status label based on API status or date logic
    let statusLabel: 'Live' | 'Upcoming' | 'Paused' | 'Ended' = 'Upcoming';
    
    // Use API status if available (more accurate)
    if (item.status === 'paused') {
      statusLabel = 'Paused';
    } else if (item.status === 'ended') {
      statusLabel = 'Ended';
    } else if (item.status === 'live' || item.status === 'active') {
      statusLabel = 'Live';
    } else {
      // Fallback to date-based logic
      if (startAt && endAt) {
        statusLabel = (now >= startAt && now <= endAt) ? 'Live' : 'Upcoming';
      } else if (endAt && now <= endAt) {
        statusLabel = 'Live';
      } else if (startAt && now >= startAt) {
        statusLabel = 'Live';
      }
    }

    return {
      id,
      kind: item.kind,
      title: item.arenaName || item.title || item.projectName || 'Untitled',
      project: {
        id: item.projectId,
        name: item.projectName || 'Unknown Project',
        slug: item.projectSlug || null,
        xHandle: item.xHandle || null,
        accessLevel: item.projectAccessLevel || null,
      },
      creatorCount: item.creatorCount || 0,
      startAt: item.startAt || null,
      endAt: item.endAt || null,
      statusLabel,
      arenaId: item.arenaId,
      arenaSlug: item.arenaSlug,
      campaignId: item.campaignId,
      programId: item.programId,
      visibility: item.visibility,
    };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/portal/arc/live-leaderboards?limit=15', {
        credentials: 'include',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to load live leaderboards (${res.status})`);
      }

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to load live leaderboards');
      }

      // Log raw API response for debugging
      console.log('[ARC Live Items] Raw API response:', {
        liveCount: data.leaderboards?.length || 0,
        upcomingCount: data.upcoming?.length || 0,
        liveItems: data.leaderboards?.map((item: any) => ({
          project: item.projectName,
          projectId: item.projectId,
          kind: item.kind,
          title: item.title,
          startAt: item.startAt,
          endAt: item.endAt,
          status: item.status,
        })) || [],
      });

      const normalizedLive = (data.leaderboards || []).map(normalizeItem);
      const normalizedUpcoming = (data.upcoming || []).map(normalizeItem);

      console.log('[ARC Live Items] Normalized items:', {
        liveCount: normalizedLive.length,
        upcomingCount: normalizedUpcoming.length,
        liveItems: normalizedLive.map((item: LiveItem) => ({
          project: item.project.name,
          title: item.title,
          statusLabel: item.statusLabel,
        })),
      });

      setLiveItems(normalizedLive);
      setUpcomingItems(normalizedUpcoming);
    } catch (err: any) {
      console.error('[ARC Live Items] Fetch error:', err);
      setError(err.message || 'Failed to load live items');
      setLiveItems([]);
      setUpcomingItems([]);
    } finally {
      setLoading(false);
    }
  }, [normalizeItem]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshNonce]);

  const refetch = useCallback(() => {
    setRefreshNonce(prev => prev + 1);
  }, []);

  return {
    liveItems,
    upcomingItems,
    allItems: [...liveItems, ...upcomingItems],
    loading,
    error,
    refetch,
  };
}

