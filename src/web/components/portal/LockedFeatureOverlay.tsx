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
  title?: string;
  description?: string;
  showPricingButton?: boolean;
  showUpgradeButton?: boolean;
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
  title,
  description,
  showPricingButton = true,
  showUpgradeButton = true,
}: LockedFeatureOverlayProps) {
  if (!isLocked) {
    return <>{children}</>;
  }

  const tierLabel = requiredTier === 'analyst' ? 'Analyst' : 'Institutional Plus';
  const defaultTitle = `${tierLabel} feature`;
  const defaultDescription =
    requiredTier === 'analyst'
      ? 'This is an Analyst feature. Upgrade to unlock competitor compare, analytics exports, and advanced insights.'
      : 'This is an Institutional Plus feature. Contact AKARI team to request access.';

  const displayTitle = title ?? defaultTitle;
  const displayDescription = description ?? defaultDescription;

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
      <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-[2px] rounded-2xl border border-akari-neon-teal/20">
        <div className="text-center p-6 max-w-sm">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-akari-neon-teal/10 border border-akari-neon-teal/30 flex items-center justify-center shadow-soft-glow">
            <svg
              className="w-7 h-7 text-akari-neon-teal"
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
          <h3 className="text-base font-bold text-gradient-teal mb-2">{displayTitle}</h3>
          <p className="text-xs text-akari-muted mb-5">{displayDescription}</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {showPricingButton && (
              <Link
                href="/portal/pricing"
                className="pill-neon px-4 py-2 bg-akari-neon-teal/10 text-akari-neon-teal hover:bg-akari-neon-teal/20 border border-akari-neon-teal/50 text-xs font-medium"
              >
                View Pricing
              </Link>
            )}
            {showUpgradeButton && (
              <button
                onClick={handleUpgradeClick}
                className="pill-neon px-4 py-2 bg-gradient-neon-teal text-black hover:shadow-neon-teal text-xs font-medium font-semibold"
              >
                Request Upgrade
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

