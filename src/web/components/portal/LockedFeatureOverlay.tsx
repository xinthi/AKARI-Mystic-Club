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
  children?: React.ReactNode;
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
 * Clean, responsive overlay that replaces locked content with an upgrade prompt.
 * When locked, shows a compact upgrade card. When unlocked, renders children normally.
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
  // If not locked, just render children
  if (!isLocked) {
    return <>{children}</>;
  }

  const tierLabel = requiredTier === 'analyst' ? 'Analyst' : 'Institutional+';
  const defaultTitle = `${tierLabel} Feature`;
  const defaultDescription =
    requiredTier === 'analyst'
      ? 'Upgrade to unlock this feature.'
      : 'Contact us for access.';

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

  // Inline styles for guaranteed rendering
  const sectionStyle: React.CSSProperties = {
    margin: '32px 0',
    width: '100%',
  };

  const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    minHeight: '320px',
    padding: '56px 40px',
    background: 'linear-gradient(145deg, #080a0c 0%, #0a0d10 50%, #0c1014 100%)',
    border: '1px solid rgba(0, 246, 162, 0.18)',
    borderRadius: '20px',
    boxShadow: '0 0 40px rgba(0, 246, 162, 0.06)',
  };

  const iconContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '80px',
    height: '80px',
    marginBottom: '28px',
    borderRadius: '50%',
    background: 'rgba(0, 246, 162, 0.08)',
    border: '2px solid rgba(0, 246, 162, 0.25)',
    flexShrink: 0,
  };

  const titleStyle: React.CSSProperties = {
    margin: '0 0 14px 0',
    fontSize: '22px',
    fontWeight: 600,
    color: '#00F6A2',
    letterSpacing: '0.01em',
  };

  const descStyle: React.CSSProperties = {
    margin: '0 0 36px 0',
    fontSize: '15px',
    lineHeight: 1.6,
    color: '#8CA0B8',
    maxWidth: '420px',
  };

  const buttonsContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  };

  const outlineBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px 32px',
    fontSize: '15px',
    fontWeight: 600,
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textDecoration: 'none',
    color: '#00F6A2',
    background: 'transparent',
    border: '2px solid rgba(0, 246, 162, 0.35)',
    minWidth: '160px',
  };

  const solidBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px 32px',
    fontSize: '15px',
    fontWeight: 600,
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textDecoration: 'none',
    color: '#000',
    background: '#00F6A2',
    border: '2px solid #00F6A2',
    minWidth: '160px',
  };

  return (
    <section style={sectionStyle}>
      <div style={cardStyle}>
        {/* Lock icon */}
        <div style={iconContainerStyle}>
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#00F6A2"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        
        {/* Text content */}
        <h3 style={titleStyle}>{displayTitle}</h3>
        <p style={descStyle}>{displayDescription}</p>

        {/* Action buttons */}
        <div style={buttonsContainerStyle}>
          {showPricingButton && (
            <Link href="/portal/pricing" style={outlineBtnStyle}>
              View Pricing
            </Link>
          )}
          {showUpgradeButton && (
            <button onClick={handleUpgradeClick} style={solidBtnStyle}>
              Request Upgrade
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

