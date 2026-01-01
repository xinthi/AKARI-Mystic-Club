/**
 * ARC Features Helper
 * 
 * Utilities for working with arc_project_features
 */

interface ProjectFeatures {
  leaderboard_enabled?: boolean;
  gamefi_enabled?: boolean;
  crm_enabled?: boolean;
  crm_visibility?: 'private' | 'public' | 'hybrid' | null;
}

interface EnabledProducts {
  ms: boolean;
  gamefi: boolean;
  crmPublic: boolean;
  crmEnabled: boolean;
}

/**
 * Get enabled products from features
 */
export function getEnabledProducts(features: ProjectFeatures | null | undefined): EnabledProducts {
  if (!features) {
    return {
      ms: false,
      gamefi: false,
      crmPublic: false,
      crmEnabled: false,
    };
  }

  return {
    ms: features.leaderboard_enabled === true,
    gamefi: features.gamefi_enabled === true,
    crmPublic: features.crm_enabled === true && features.crm_visibility === 'public',
    crmEnabled: features.crm_enabled === true,
  };
}

/**
 * Get CRM visibility label
 */
export function getCrmVisibilityLabel(features: ProjectFeatures | null | undefined): 'private' | 'public' | 'hybrid' | 'unknown' {
  if (!features || !features.crm_enabled) {
    return 'unknown';
  }

  return features.crm_visibility || 'unknown';
}
