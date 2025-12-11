/**
 * useAnalystPromo Hook
 * 
 * Manages the Analyst Social Boost promotional quest state.
 * Only shows to Seer users without Deep Analytics addon.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAkariUser } from '@/lib/akari-auth';
import { getUserTier } from '@/lib/userTier';
import { can, FEATURE_KEYS } from '@/lib/permissions';

// =============================================================================
// TYPES
// =============================================================================

export type PromoStatus = 
  | 'never_seen'
  | 'accepted'
  | 'declined_recently'
  | 'declined_long_term'
  | 'completed'
  | 'not_eligible';

export interface UseAnalystPromoReturn {
  // State
  isOpen: boolean;
  status: PromoStatus;
  isLoading: boolean;
  isVerifying: boolean;
  isDeciding: boolean;
  error: string | null;
  verifyError: string | null;
  grantedUntil: string | null;
  
  // Actions
  openModal: () => void;
  closeModal: () => void;
  accept: () => Promise<void>;
  skip: () => Promise<void>;
  never: () => Promise<void>;
  verify: () => Promise<void>;
  
  // Computed
  isEligible: boolean;
  shouldShowPromo: boolean;
}

// =============================================================================
// HOOK
// =============================================================================

export function useAnalystPromo(): UseAnalystPromoReturn {
  const { user, isLoggedIn, isLoading: isAuthLoading } = useAkariUser();
  
  // State
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<PromoStatus>('never_seen');
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDeciding, setIsDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [grantedUntil, setGrantedUntil] = useState<string | null>(null);
  const [shouldShowPromo, setShouldShowPromo] = useState(false);

  // Computed eligibility (client-side check)
  const tier = user ? getUserTier(user) : 'seer';
  const hasDeepAnalytics = user ? can(user, FEATURE_KEYS.DeepAnalyticsAddon) : false;
  const isEligible = isLoggedIn && tier === 'seer' && !hasDeepAnalytics;

  // Fetch promo status on mount (only if potentially eligible)
  useEffect(() => {
    if (isAuthLoading) return;
    
    if (!isLoggedIn || !isEligible) {
      setIsLoading(false);
      setShouldShowPromo(false);
      return;
    }

    const fetchStatus = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const res = await fetch('/api/portal/promo/analyst-social-boost/status');
        const data = await res.json();

        if (!data.ok) {
          setError(data.error || 'Failed to load promo status');
          return;
        }

        setStatus(data.status || 'never_seen');
        setShouldShowPromo(data.showPromo);

        // Auto-open modal if backend says to show promo
        if (data.showPromo && data.status !== 'accepted') {
          setIsOpen(true);
        }
      } catch (err: any) {
        console.error('[useAnalystPromo] Fetch error:', err);
        setError('Failed to load promo status');
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
  }, [isLoggedIn, isEligible, isAuthLoading]);

  // Actions
  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);

  const makeDecision = useCallback(async (action: 'accept' | 'skip' | 'never') => {
    if (isDeciding) return;

    try {
      setIsDeciding(true);
      setError(null);

      const res = await fetch('/api/portal/promo/analyst-social-boost/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error || 'Failed to save decision');
        return;
      }

      setStatus(data.status);

      // Close modal on skip or never
      if (action === 'skip' || action === 'never') {
        setIsOpen(false);
        setShouldShowPromo(false);
      }
    } catch (err: any) {
      console.error('[useAnalystPromo] Decision error:', err);
      setError('Failed to save decision');
    } finally {
      setIsDeciding(false);
    }
  }, [isDeciding]);

  const accept = useCallback(() => makeDecision('accept'), [makeDecision]);
  const skip = useCallback(() => makeDecision('skip'), [makeDecision]);
  const never = useCallback(() => makeDecision('never'), [makeDecision]);

  const verify = useCallback(async () => {
    if (isVerifying) return;

    try {
      setIsVerifying(true);
      setVerifyError(null);

      const res = await fetch('/api/portal/promo/analyst-social-boost/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (!data.ok) {
        setVerifyError(data.details || data.error || 'Verification failed');
        return;
      }

      // Success!
      setStatus('completed');
      setGrantedUntil(data.grantedUntil);
      setShouldShowPromo(false);

      // Keep modal open to show success message
      // User can close it manually
    } catch (err: any) {
      console.error('[useAnalystPromo] Verify error:', err);
      setVerifyError('Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  }, [isVerifying]);

  return {
    isOpen,
    status,
    isLoading,
    isVerifying,
    isDeciding,
    error,
    verifyError,
    grantedUntil,
    openModal,
    closeModal,
    accept,
    skip,
    never,
    verify,
    isEligible,
    shouldShowPromo,
  };
}

export default useAnalystPromo;

