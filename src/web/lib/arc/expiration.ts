/**
 * ARC Expiration Helpers
 * 
 * Utilities for checking if ARC access has expired based on arc_active_until.
 * 
 * Policy: If arc_active_until is set and < now, treat ARC as disabled
 * even if arc_active=true. This is a "virtual disable" - no DB update needed.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ArcExpirationCheck {
  isExpired: boolean;
  effectiveArcActive: boolean; // arc_active after expiration check
  expiresAt: Date | null;
}

// =============================================================================
// EXPIRATION CHECK
// =============================================================================

/**
 * Check if ARC access has expired based on arc_active_until.
 * 
 * @param arcActive - Current arc_active value from DB
 * @param arcActiveUntil - arc_active_until timestamp from DB (can be null)
 * @returns Check result with effective arc_active status
 */
export function checkArcExpiration(
  arcActive: boolean,
  arcActiveUntil: string | null | undefined
): ArcExpirationCheck {
  // If arc_active is false, always disabled (no need to check expiration)
  if (!arcActive) {
    return {
      isExpired: false,
      effectiveArcActive: false,
      expiresAt: null,
    };
  }
  
  // If no expiration date set, ARC is active
  if (!arcActiveUntil) {
    return {
      isExpired: false,
      effectiveArcActive: true,
      expiresAt: null,
    };
  }
  
  // Parse expiration date
  const expiresAt = new Date(arcActiveUntil);
  const now = new Date();
  
  // Check if expired
  const isExpired = expiresAt < now;
  
  return {
    isExpired,
    effectiveArcActive: !isExpired, // Active only if not expired
    expiresAt,
  };
}

/**
 * Get effective ARC state (considering expiration).
 * Returns true only if arc_active=true AND (arc_active_until is null OR arc_active_until >= now).
 */
export function getEffectiveArcActive(
  arcActive: boolean,
  arcActiveUntil: string | null | undefined
): boolean {
  const check = checkArcExpiration(arcActive, arcActiveUntil);
  return check.effectiveArcActive;
}

/**
 * Format expiration message for display.
 */
export function formatExpirationMessage(expiresAt: Date | null): string | null {
  if (!expiresAt) {
    return null;
  }
  
  const now = new Date();
  if (expiresAt < now) {
    const daysAgo = Math.floor((now.getTime() - expiresAt.getTime()) / (1000 * 60 * 60 * 24));
    return `ARC access expired ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`;
  }
  
  const daysUntil = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil === 0) {
    return 'ARC access expires today';
  } else if (daysUntil === 1) {
    return 'ARC access expires tomorrow';
  } else {
    return `ARC access expires in ${daysUntil} days`;
  }
}

