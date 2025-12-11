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
    <div className="relative group">
      {/* Blurred content - more subtle blur */}
      <div className="blur-[3px] opacity-40 pointer-events-none select-none transition-all duration-300 group-hover:blur-[4px] group-hover:opacity-30">
        {children}
      </div>

      {/* Overlay with improved animations */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-black/85 via-black/90 to-akari-neon-teal/5 backdrop-blur-[1px] rounded-2xl border border-akari-neon-teal/20 transition-all duration-300 hover:border-akari-neon-teal/40">
        <div className="text-center p-6 max-w-sm animate-fade-in">
          {/* Lock icon with pulse animation */}
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gradient-to-br from-akari-neon-teal/20 to-akari-neon-violet/10 border border-akari-neon-teal/40 flex items-center justify-center shadow-[0_0_20px_rgba(0,229,160,0.2)] animate-pulse-subtle">
            <svg
              className="w-6 h-6 text-akari-neon-teal drop-shadow-[0_0_4px_rgba(0,229,160,0.5)]"
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
          
          {/* Title with gradient */}
          <h3 className="text-sm font-bold text-gradient-teal mb-1.5">{displayTitle}</h3>
          
          {/* Description - more compact */}
          <p className="text-xs text-akari-muted/90 mb-4 leading-relaxed max-w-[260px] mx-auto">{displayDescription}</p>

          {/* Action buttons - improved styling */}
          <div className="flex items-center justify-center gap-2.5">
            {showPricingButton && (
              <Link
                href="/portal/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className="pill-neon px-3.5 py-1.5 bg-akari-neon-teal/10 text-akari-neon-teal hover:bg-akari-neon-teal/20 border border-akari-neon-teal/40 hover:border-akari-neon-teal/60 text-xs font-medium transition-all duration-300 hover:shadow-[0_0_12px_rgba(0,229,160,0.2)]"
              >
                View Pricing
              </Link>
            )}
            {showUpgradeButton && (
              <button
                onClick={handleUpgradeClick}
                className="pill-neon px-3.5 py-1.5 bg-gradient-to-r from-akari-neon-teal to-akari-neon-violet/80 text-black hover:shadow-[0_0_20px_rgba(0,229,160,0.4)] text-xs font-semibold transition-all duration-300"
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

