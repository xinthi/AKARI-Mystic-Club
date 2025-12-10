/**
 * ProfileDeepExplorerAccess Component
 * 
 * Allows users to see their Deep Explorer access status and request access.
 */

import React, { useState, useEffect } from 'react';
import type { AccessRequestStatus } from '@/lib/types/access-requests';
import { FEATURE_KEYS } from '@/lib/permissions';

// =============================================================================
// TYPES
// =============================================================================

export interface ProfileDeepExplorerAccessProps {
  /** Whether user already has Deep Explorer access */
  hasDeepAccess: boolean;
  /** Whether user has Institutional Plus */
  hasInstitutionalPlus: boolean;
  /** Current pending request status (from parent state) */
  pendingRequestStatus: AccessRequestStatus | null;
  /** Callback when request is successfully submitted */
  onRequestSubmitted?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileDeepExplorerAccess({
  hasDeepAccess,
  hasInstitutionalPlus,
  pendingRequestStatus,
  onRequestSubmitted,
}: ProfileDeepExplorerAccessProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPendingStatus, setLocalPendingStatus] = useState<AccessRequestStatus | null>(pendingRequestStatus);

  // Sync with prop changes (use effect to avoid conditional setState)
  React.useEffect(() => {
    if (!isRequesting) {
      setLocalPendingStatus(pendingRequestStatus);
    }
  }, [pendingRequestStatus, isRequesting]);

  // Determine current state
  const isPending = localPendingStatus === 'pending';
  const canRequest = !hasDeepAccess && !isPending;

  // Handle request submission
  const handleRequest = async () => {
    if (isRequesting || !canRequest) return;

    setIsRequesting(true);
    setError(null);

    try {
      const res = await fetch('/api/portal/access/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          featureKey: FEATURE_KEYS.DeepExplorer,
          requestedPlan: hasInstitutionalPlus ? 'institutional_plus' : null,
          justification: '',
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to submit request');
      }

      // Update local state to show pending
      setLocalPendingStatus('pending');
      
      // Notify parent
      if (onRequestSubmitted) {
        onRequestSubmitted();
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again later.');
    } finally {
      setIsRequesting(false);
    }
  };

  // Determine subtitle text
  const getSubtitle = (): string => {
    if (hasDeepAccess) {
      return 'You already have access to Deep Explorer.';
    }
    if (isPending) {
      return 'Your request is being reviewed.';
    }
    if (hasInstitutionalPlus) {
      return 'Deep Explorer is available as part of your plan. Request activation.';
    }
    return 'Deep Explorer is part of Institutional Plus. You can request access.';
  };

  // Determine button text and state
  const getButtonProps = (): { text: string; disabled: boolean } => {
    if (hasDeepAccess) {
      return { text: 'Access granted', disabled: true };
    }
    if (isPending) {
      return { text: 'Request pending', disabled: true };
    }
    if (isRequesting) {
      return { text: 'Requesting...', disabled: true };
    }
    return { text: 'Request Deep Explorer', disabled: false };
  };

  const buttonProps = getButtonProps();
  const subtitle = getSubtitle();

  return (
    <div className="neon-card neon-hover p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🔍</span>
        <h2 className="text-sm uppercase tracking-wider font-semibold text-gradient-pink">
          Deep Explorer
        </h2>
      </div>

      {/* Subtitle */}
      <p className="text-sm text-akari-muted mb-6 leading-relaxed">
        {subtitle}
      </p>

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-400 mb-4 font-semibold">
          {error}
        </p>
      )}

      {/* Action button */}
      <button
        onClick={handleRequest}
        disabled={buttonProps.disabled}
        className={`
          w-full pill-neon min-h-[44px] px-5 py-2.5 text-sm font-semibold transition-all duration-300
          ${buttonProps.disabled
            ? 'bg-akari-cardSoft/50 text-akari-muted border border-akari-neon-teal/20 cursor-not-allowed'
            : 'bg-akari-neon-teal/20 text-akari-neon-teal border border-akari-neon-teal/50 hover:bg-akari-neon-teal/30 hover:shadow-[0_0_12px_rgba(0,246,162,0.3)]'
          }
        `}
      >
        {buttonProps.text}
      </button>
    </div>
  );
}

