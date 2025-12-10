/**
 * Locked Feature Overlay Component
 * 
 * Displays a locked state for features that require a higher tier.
 * Reusable across the portal for consistent paywall UI.
 */

import React from 'react';
import Link from 'next/link';

// =============================================================================
// TYPES
// =============================================================================

export interface LockedFeatureOverlayProps {
  featureName: string;
  children: React.ReactNode;
  isLocked: boolean;
  requiredTier: 'analyst' | 'institutional_plus';
  onUpgradeClick?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Locked Feature Overlay
 * 
 * Shows a blurred version of locked content with an upgrade prompt.
 */
export function LockedFeatureOverlay({
  featureName,
  children,
  isLocked,
  requiredTier,
  onUpgradeClick,
}: LockedFeatureOverlayProps) {
  if (!isLocked) {
    return <>{children}</>;
  }

  const tierLabel = requiredTier === 'analyst' ? 'Analyst' : 'Institutional Plus';
  const tierDescription =
    requiredTier === 'analyst'
      ? 'This is an Analyst feature. Upgrade to unlock competitor compare, analytics exports, and advanced insights.'
      : 'This is an Institutional Plus feature. Contact AKARI team to request access.';

  const handleUpgradeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onUpgradeClick) {
      onUpgradeClick();
    } else {
      window.location.href = '/portal/pricing';
    }
  };

  return (
    <div className="relative">
      {/* Blurred content */}
      <div className="blur-sm opacity-50 pointer-events-none select-none">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-akari-bg/80 backdrop-blur-[2px] rounded-2xl">
        <div className="text-center p-6 max-w-sm">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-akari-primary/10 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-akari-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-akari-text mb-2">{featureName}</h3>
          <p className="text-xs text-akari-muted mb-4">{tierDescription}</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
            <Link
              href="/portal/pricing"
              className="px-4 py-2 rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 transition text-xs font-medium"
            >
              View Pricing
            </Link>
            <button
              onClick={handleUpgradeClick}
              className="px-4 py-2 rounded-lg bg-akari-primary text-black hover:opacity-90 transition text-xs font-medium"
            >
              Request Upgrade
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

