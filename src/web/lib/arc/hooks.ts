/**
 * ARC React Hooks
 * 
 * Custom hooks for ARC functionality
 */

import { useState, useEffect } from 'react';
import { fetchCurrentMsArena, type CurrentMsArenaResponse } from './api';

// =============================================================================
// TYPES
// =============================================================================

export interface UseCurrentMsArenaResult {
  arena: any | null;
  debug: {
    live_active_count: number;
    live_count: number;
    active_count: number;
  } | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook to load and manage the current active mindshare arena for a project
 */
export function useCurrentMsArena(projectId: string | null): UseCurrentMsArenaResult {
  const [arena, setArena] = useState<any | null>(null);
  const [debug, setDebug] = useState<{
    live_active_count: number;
    live_count: number;
    active_count: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    // If projectId is null, do nothing
    if (!projectId) {
      setArena(null);
      setDebug(null);
      setLoading(false);
      setError(null);
      return;
    }

    // TypeScript: projectId is now guaranteed to be string (not null)
    const validProjectId: string = projectId;

    let cancelled = false;

    async function loadArena() {
      setLoading(true);
      setError(null);

      try {
        const data: CurrentMsArenaResponse = await fetchCurrentMsArena(validProjectId);
        
        if (cancelled) return;

        setArena(data.arena);
        setDebug(data.debug);
      } catch (err: any) {
        if (cancelled) return;
        
        setError(err.message || 'Failed to load current arena');
        setArena(null);
        setDebug(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadArena();

    return () => {
      cancelled = true;
    };
  }, [projectId, refreshTrigger]);

  const refresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return {
    arena,
    debug,
    loading,
    error,
    refresh,
  };
}
