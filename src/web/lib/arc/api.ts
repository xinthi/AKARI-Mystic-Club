/**
 * ARC API Client Helpers
 * 
 * Client-side functions to call ARC API endpoints
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CurrentMsArenaResponse {
  ok: true;
  projectId: string;
  arena: any | null;
  debug: {
    live_active_count: number;
    live_count: number;
    active_count: number;
  };
}

export interface ActivateMsArenaResponse {
  ok: true;
  projectId: string;
  activatedArenaId: string;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Fetch the current active mindshare arena for a project
 */
export async function fetchCurrentMsArena(projectId: string): Promise<CurrentMsArenaResponse> {
  const res = await fetch(`/api/portal/arc/projects/${encodeURIComponent(projectId)}/current-ms-arena`, {
    credentials: 'include',
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Failed to fetch current arena' }));
    throw new Error(errorData.error || 'Failed to fetch current arena');
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'Failed to fetch current arena');
  }

  return data;
}

/**
 * Activate a mindshare arena
 */
export async function activateMsArena(arenaId: string): Promise<ActivateMsArenaResponse> {
  const res = await fetch(`/api/portal/admin/arc/arenas/${encodeURIComponent(arenaId)}/activate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Failed to activate arena' }));
    throw new Error(errorData.error || 'Failed to activate arena');
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'Failed to activate arena');
  }

  return data;
}
