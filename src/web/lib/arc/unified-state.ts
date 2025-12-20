/**
 * ARC Unified State Helpers
 * 
 * Provides unified module enablement state with fallback to legacy fields.
 * Reads from arc_project_features first, falls back to projects.arc_access_level if row missing.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

export interface ModuleState {
  enabled: boolean;
  active: boolean;
  startAt: string | null;
  endAt: string | null;
  reason?: string;
}

export interface CrmModuleState extends ModuleState {
  visibility: 'private' | 'public' | 'hybrid';
}

export interface ArcUnifiedState {
  modules: {
    leaderboard: ModuleState;
    gamefi: ModuleState;
    crm: CrmModuleState;
  };
  requests: {
    pending: boolean;
    lastStatus: 'pending' | 'approved' | 'rejected' | null;
  };
  reason?: string;
}

interface LegacyProjectData {
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' | null;
  arc_active: boolean;
  arc_active_until: string | null;
}

interface ArcProjectFeaturesRow {
  leaderboard_enabled: boolean;
  leaderboard_start_at: string | null;
  leaderboard_end_at: string | null;
  gamefi_enabled: boolean;
  gamefi_start_at: string | null;
  gamefi_end_at: string | null;
  crm_enabled: boolean;
  crm_start_at: string | null;
  crm_end_at: string | null;
  crm_visibility: 'private' | 'public' | 'hybrid';
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if module is active based on enabled flag and date range.
 */
function isModuleActive(
  enabled: boolean,
  startAt: string | null,
  endAt: string | null
): { active: boolean; reason?: string } {
  if (!enabled) {
    return { active: false };
  }

  // If enabled but dates are missing or invalid, treat as inactive
  if (!startAt || !endAt) {
    return { active: false, reason: 'Module enabled but dates missing' };
  }

  const now = new Date();
  const start = new Date(startAt);
  const end = new Date(endAt);

  // Validate date range
  if (end <= start) {
    return { active: false, reason: 'Invalid date range (end_at <= start_at)' };
  }

  // Check if current time is within range
  const active = now >= start && now <= end;

  if (!active) {
    if (now < start) {
      return { active: false, reason: `Module starts at ${startAt}` };
    } else {
      return { active: false, reason: `Module ended at ${endAt}` };
    }
  }

  return { active: true };
}

/**
 * Map legacy arc_access_level to module enablements (fallback).
 */
function mapLegacyAccessLevel(accessLevel: string | null): {
  leaderboard: boolean;
  gamefi: boolean;
  crm: boolean;
} {
  switch (accessLevel) {
    case 'leaderboard':
      return { leaderboard: true, gamefi: false, crm: false };
    case 'gamified':
      return { leaderboard: false, gamefi: true, crm: false };
    case 'creator_manager':
      return { leaderboard: false, gamefi: false, crm: true };
    case 'none':
    case null:
    default:
      return { leaderboard: false, gamefi: false, crm: false };
  }
}

/**
 * Get unified ARC state for a project.
 * 
 * Reads from arc_project_features first, falls back to projects.arc_access_level if row missing.
 */
export async function getArcUnifiedState(
  supabase: SupabaseClient,
  projectId: string,
  profileId?: string | null
): Promise<ArcUnifiedState> {
  // Try to get module enablements from arc_project_features
  const { data: featuresRow, error: featuresError } = await supabase
    .from('arc_project_features')
    .select('*')
    .eq('project_id', projectId)
    .single();

  // Get legacy fields as fallback
  const { data: projectData, error: projectError } = await supabase
    .from('projects')
    .select('arc_access_level, arc_active, arc_active_until')
    .eq('id', projectId)
    .single();

  const legacy: LegacyProjectData = {
    arc_access_level: projectData?.arc_access_level || null,
    arc_active: projectData?.arc_active ?? false,
    arc_active_until: projectData?.arc_active_until || null,
  };

  let leaderboardState: ModuleState;
  let gamefiState: ModuleState;
  let crmState: CrmModuleState;

  // If arc_project_features row exists, use it
  if (featuresRow && !featuresError) {
    const features = featuresRow as ArcProjectFeaturesRow;

    // Leaderboard module
    const leaderboardActive = isModuleActive(
      features.leaderboard_enabled,
      features.leaderboard_start_at,
      features.leaderboard_end_at
    );
    leaderboardState = {
      enabled: features.leaderboard_enabled,
      active: leaderboardActive.active,
      startAt: features.leaderboard_start_at,
      endAt: features.leaderboard_end_at,
      reason: leaderboardActive.reason,
    };

    // GameFi module
    const gamefiActive = isModuleActive(
      features.gamefi_enabled,
      features.gamefi_start_at,
      features.gamefi_end_at
    );
    gamefiState = {
      enabled: features.gamefi_enabled,
      active: gamefiActive.active,
      startAt: features.gamefi_start_at,
      endAt: features.gamefi_end_at,
      reason: gamefiActive.reason,
    };

    // CRM module
    const crmActive = isModuleActive(
      features.crm_enabled,
      features.crm_start_at,
      features.crm_end_at
    );
    crmState = {
      enabled: features.crm_enabled,
      active: crmActive.active,
      startAt: features.crm_start_at,
      endAt: features.crm_end_at,
      visibility: features.crm_visibility || 'private',
      reason: crmActive.reason,
    };
  } else {
    // Fallback to legacy fields
    // Use arc_active and arc_active_until to determine if any module is active
    const legacyModules = mapLegacyAccessLevel(legacy.arc_access_level);
    const now = new Date();
    const activeUntil = legacy.arc_active_until ? new Date(legacy.arc_active_until) : null;
    const isLegacyActive = legacy.arc_active && (!activeUntil || activeUntil >= now);

    leaderboardState = {
      enabled: legacyModules.leaderboard,
      active: legacyModules.leaderboard && isLegacyActive,
      startAt: null,
      endAt: legacy.arc_active_until,
      reason: !isLegacyActive && legacyModules.leaderboard ? 'Using legacy fields (no dates available)' : undefined,
    };

    gamefiState = {
      enabled: legacyModules.gamefi,
      active: legacyModules.gamefi && isLegacyActive,
      startAt: null,
      endAt: legacy.arc_active_until,
      reason: !isLegacyActive && legacyModules.gamefi ? 'Using legacy fields (no dates available)' : undefined,
    };

    crmState = {
      enabled: legacyModules.crm,
      active: legacyModules.crm && isLegacyActive,
      startAt: null,
      endAt: legacy.arc_active_until,
      visibility: 'private', // Default for legacy
      reason: !isLegacyActive && legacyModules.crm ? 'Using legacy fields (no dates available)' : undefined,
    };
  }

  // Get request status (if profileId provided)
  let pendingRequest = false;
  let lastRequestStatus: 'pending' | 'approved' | 'rejected' | null = null;

  if (profileId) {
    const { data: requests } = await supabase
      .from('arc_leaderboard_requests')
      .select('status')
      .eq('project_id', projectId)
      .eq('requested_by', profileId)
      .in('status', ['pending', 'approved', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (requests && requests.length > 0) {
      lastRequestStatus = requests[0].status as 'pending' | 'approved' | 'rejected';
      pendingRequest = lastRequestStatus === 'pending';
    }
  }

  return {
    modules: {
      leaderboard: leaderboardState,
      gamefi: gamefiState,
      crm: crmState,
    },
    requests: {
      pending: pendingRequest,
      lastStatus: lastRequestStatus,
    },
  };
}

/**
 * Check if any module is active (convenience function).
 */
export function hasAnyActiveModule(state: ArcUnifiedState): boolean {
  return state.modules.leaderboard.active || state.modules.gamefi.active || state.modules.crm.active;
}

/**
 * Get legacy arc_access_level equivalent (for backward compatibility).
 */
export function getLegacyAccessLevel(state: ArcUnifiedState): 'none' | 'creator_manager' | 'leaderboard' | 'gamified' {
  if (state.modules.leaderboard.enabled) return 'leaderboard';
  if (state.modules.gamefi.enabled) return 'gamified';
  if (state.modules.crm.enabled) return 'creator_manager';
  return 'none';
}

/**
 * Get legacy arc_active equivalent (for backward compatibility).
 */
export function getLegacyArcActive(state: ArcUnifiedState): boolean {
  return hasAnyActiveModule(state);
}

