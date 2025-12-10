/**
 * Data Freshness Helper for Sentiment Terminal
 * 
 * Classifies and formats data freshness indicators for projects.
 */

export type FreshnessLabel = 'Fresh' | 'Warm' | 'Stale';
export type FreshnessSeverity = 'low' | 'medium' | 'high';

export interface FreshnessInfo {
  label: FreshnessLabel;
  ageHuman: string;
  severity: FreshnessSeverity;
  lastUpdatedAt: Date | null;
}

/**
 * Classify data freshness based on last update timestamp.
 * 
 * Thresholds:
 * - Fresh: within last 24 hours
 * - Warm: between 24 and 72 hours
 * - Stale: older than 72 hours
 * 
 * @param lastUpdatedAt - ISO timestamp string or Date object, or null/undefined
 * @returns FreshnessInfo with label, human-readable age, and severity
 */
export function classifyFreshness(lastUpdatedAt: string | Date | null | undefined): FreshnessInfo {
  // Handle null/undefined - treat as stale
  if (!lastUpdatedAt) {
    return {
      label: 'Stale',
      ageHuman: 'unknown',
      severity: 'high',
      lastUpdatedAt: null,
    };
  }

  // Parse to Date if string
  const updateDate = typeof lastUpdatedAt === 'string' ? new Date(lastUpdatedAt) : lastUpdatedAt;
  
  // Check if date is valid
  if (isNaN(updateDate.getTime())) {
    return {
      label: 'Stale',
      ageHuman: 'invalid date',
      severity: 'high',
      lastUpdatedAt: null,
    };
  }

  const now = new Date();
  const ageMs = now.getTime() - updateDate.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Classify freshness
  let label: FreshnessLabel;
  let severity: FreshnessSeverity;

  if (ageHours <= 24) {
    label = 'Fresh';
    severity = 'low';
  } else if (ageHours <= 72) {
    label = 'Warm';
    severity = 'medium';
  } else {
    label = 'Stale';
    severity = 'high';
  }

  // Format human-readable age
  let ageHuman: string;
  if (ageHours < 1) {
    const minutes = Math.floor(ageMs / (1000 * 60));
    ageHuman = minutes <= 1 ? 'just now' : `${minutes} minutes ago`;
  } else if (ageHours < 24) {
    const hours = Math.floor(ageHours);
    ageHuman = hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  } else if (ageDays < 7) {
    const days = Math.floor(ageDays);
    ageHuman = days === 1 ? '1 day ago' : `${days} days ago`;
  } else if (ageDays < 30) {
    const weeks = Math.floor(ageDays / 7);
    ageHuman = weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  } else {
    const months = Math.floor(ageDays / 30);
    ageHuman = months === 1 ? '1 month ago' : `${months} months ago`;
  }

  return {
    label,
    ageHuman,
    severity,
    lastUpdatedAt: updateDate,
  };
}

/**
 * Format timestamp for tooltip display.
 * Shows date and time in UTC format.
 */
export function formatTimestampForTooltip(timestamp: string | Date | null | undefined): string {
  if (!timestamp) {
    return 'Unknown';
  }

  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  
  if (isNaN(date.getTime())) {
    return 'Invalid date';
  }

  // Format as: "2025-12-08 06:03 UTC"
  return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

/**
 * Get CSS classes for freshness pill styling.
 */
export function getFreshnessPillClasses(freshness: FreshnessInfo): string {
  const baseClasses = 'px-2 py-0.5 rounded-full text-xs font-medium';
  
  switch (freshness.label) {
    case 'Fresh':
      return `${baseClasses} bg-green-500/20 text-green-400 border border-green-500/30`;
    case 'Warm':
      return `${baseClasses} bg-yellow-500/20 text-yellow-400 border border-yellow-500/30`;
    case 'Stale':
      return `${baseClasses} bg-red-500/20 text-red-400 border border-red-500/30`;
    default:
      return `${baseClasses} bg-akari-muted/20 text-akari-muted border border-akari-muted/30`;
  }
}

