/**
 * Upgrade Modal Component
 * 
 * Modal that explains how to upgrade using manual crypto payments and admin approval.
 * Includes form for submitting upgrade requests.
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getUserTier, canUpgradeTo, type UserTier, TIER_INFO } from '@/lib/userTier';
import type { AkariUser } from '@/lib/permissions';

// =============================================================================
// TYPES
// =============================================================================

export interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AkariUser | null;
  targetTier?: 'analyst' | 'institutional_plus';
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getContactLink(): string {
  // Placeholder - can be updated to actual contact method
  // Options: mailto, Telegram link, or contact page
  return 'mailto:contact@akarimystic.club';
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Upgrade Modal
 * 
 * Shows upgrade information and manual payment instructions.
 * Includes form for submitting upgrade requests.
 */
export function UpgradeModal({ isOpen, onClose, user, targetTier }: UpgradeModalProps) {
  const currentTier = getUserTier(user);
  const currentTierInfo = TIER_INFO[currentTier];
  const canUpgradeToAnalyst = canUpgradeTo(user, 'analyst');
  const canUpgradeToInstitutional = canUpgradeTo(user, 'institutional_plus');

  // Form state
  const [selectedTier, setSelectedTier] = useState<'analyst' | 'institutional_plus'>(
    targetTier || (canUpgradeToAnalyst ? 'analyst' : 'institutional_plus')
  );
  const [xHandle, setXHandle] = useState<string>(user?.xUsername || '');
  const [message, setMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset form when modal opens/closes or targetTier changes
  useEffect(() => {
    if (isOpen) {
      setSelectedTier(targetTier || (canUpgradeToAnalyst ? 'analyst' : 'institutional_plus'));
      setXHandle(user?.xUsername || '');
      setMessage('');
      setSubmitSuccess(false);
      setSubmitError(null);
    }
  }, [isOpen, targetTier, canUpgradeToAnalyst, user?.xUsername]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/portal/access/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          desiredTier: selectedTier,
          xHandle: xHandle.trim() || null,
          message: message.trim() || null,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to submit upgrade request');
      }

      setSubmitSuccess(true);
      
      // Auto-close after 3 seconds on success
      setTimeout(() => {
        setSubmitSuccess(false);
        onClose();
      }, 3000);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit upgrade request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="neon-card border-2 border-akari-neon-teal/30 rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-[0_0_40px_rgba(0,246,162,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-gradient-neon">Upgrade your AKARI access</h2>
          <button
            onClick={onClose}
            className="text-akari-muted hover:text-akari-neon-teal transition-all duration-300 hover:drop-shadow-[0_0_8px_rgba(0,246,162,0.6)]"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Current Tier */}
        <div className="mb-8 neon-card neon-hover p-5 border border-akari-neon-teal/30">
          <div className="text-xs text-akari-muted uppercase tracking-wider font-semibold mb-2">Your Current Level</div>
          <div className={`text-2xl font-bold ${currentTierInfo.color}`}>
            {currentTierInfo.name}
          </div>
        </div>

        {/* Upgrade to Analyst */}
        {canUpgradeToAnalyst && (
          <div className="mb-8 neon-card neon-hover p-6 border-2 border-akari-neon-violet/50">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-full bg-gradient-neon-pink flex items-center justify-center flex-shrink-0 shadow-neon-pink">
                <svg className="w-6 h-6 text-black" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gradient-pink mb-3">Analyst</h3>
                <p className="text-sm text-akari-text mb-3 leading-relaxed">
                  Designed for active CT analysts, founders, and creators.
                </p>
                <p className="text-sm text-akari-text mb-4 leading-relaxed">
                  Unlock full competitor analysis, advanced Twitter analytics, CSV exports, and richer narrative tools.
                </p>
                <div className="neon-card p-4 border border-akari-neon-violet/20">
                  <p className="text-xs text-akari-muted leading-relaxed">
                    To upgrade, contact the AKARI team with your X handle and desired tier. You will receive a crypto payment address and simple instructions. Once your transaction is confirmed on-chain, your account will be upgraded manually.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Upgrade to Institutional Plus */}
        {canUpgradeToInstitutional && (
          <div className="mb-8 neon-card neon-hover p-6 border-2 border-akari-neon-pink/50">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-full bg-gradient-neon-pink flex items-center justify-center flex-shrink-0 shadow-neon-pink">
                <svg className="w-6 h-6 text-black" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gradient-pink mb-3">Institutional Plus</h3>
                <p className="text-sm text-akari-text mb-3 leading-relaxed">
                  For funds, desks, and large teams that need deeper coverage.
                </p>
                <p className="text-sm text-akari-text mb-4 leading-relaxed">
                  Includes everything in Analyst plus Deep Explorer, 90 day sentiment, inner circle reach, and custom support.
                </p>
                <div className="neon-card p-4 border border-akari-neon-pink/20">
                  <p className="text-xs text-akari-muted leading-relaxed">
                    Institutional Plus is invite only. Contact the AKARI team to discuss access.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Shared Upgrade Request Form */}
        {(canUpgradeToAnalyst || canUpgradeToInstitutional) && (
          <div className="mb-8 neon-card neon-hover p-6 border border-akari-neon-teal/30">
            <h3 className="text-base font-bold text-gradient-teal mb-6">Request Upgrade</h3>
            
            {!submitSuccess ? (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Tier Selection */}
                {(canUpgradeToAnalyst && canUpgradeToInstitutional) && (
                  <div>
                    <label className="block text-xs font-semibold text-akari-muted uppercase tracking-wider mb-3">
                      Request upgrade to:
                    </label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedTier('analyst')}
                        className={`flex-1 pill-neon px-5 py-2.5 border transition-all duration-300 text-sm font-semibold ${
                          selectedTier === 'analyst'
                            ? 'bg-akari-neon-violet/20 text-akari-neon-violet border-akari-neon-violet/50 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                            : 'bg-akari-cardSoft/50 text-akari-muted border-akari-neon-teal/20 hover:border-akari-neon-teal/40'
                        }`}
                      >
                        Analyst
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedTier('institutional_plus')}
                        className={`flex-1 pill-neon px-5 py-2.5 border transition-all duration-300 text-sm font-semibold ${
                          selectedTier === 'institutional_plus'
                            ? 'bg-akari-neon-pink/20 text-akari-neon-pink border-akari-neon-pink/50 shadow-[0_0_12px_rgba(255,16,240,0.3)]'
                            : 'bg-akari-cardSoft/50 text-akari-muted border-akari-neon-teal/20 hover:border-akari-neon-teal/40'
                        }`}
                      >
                        Institutional Plus
                      </button>
                    </div>
                  </div>
                )}

                {/* X Handle Input */}
                <div>
                  <label htmlFor="xHandle" className="block text-xs font-semibold text-akari-muted uppercase tracking-wider mb-2">
                    Your X handle <span className="normal-case text-akari-muted/70">(optional)</span>
                  </label>
                  <input
                    id="xHandle"
                    type="text"
                    value={xHandle}
                    onChange={(e) => setXHandle(e.target.value)}
                    placeholder="@username"
                    className="w-full px-4 py-3 rounded-xl bg-akari-cardSoft/50 border border-akari-neon-teal/20 text-akari-text placeholder:text-akari-muted/50 focus:outline-none focus:border-akari-neon-teal/50 focus:ring-2 focus:ring-akari-neon-teal/20 transition-all duration-300"
                    disabled={isSubmitting}
                  />
                </div>

                {/* Message Input */}
                <div>
                  <label htmlFor="message" className="block text-xs font-semibold text-akari-muted uppercase tracking-wider mb-2">
                    Message to AKARI team <span className="normal-case text-akari-muted/70">(optional)</span>
                  </label>
                  <textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us about your use case or any questions..."
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl bg-akari-cardSoft/50 border border-akari-neon-teal/20 text-akari-text placeholder:text-akari-muted/50 focus:outline-none focus:border-akari-neon-teal/50 focus:ring-2 focus:ring-akari-neon-teal/20 transition-all duration-300 resize-none"
                    disabled={isSubmitting}
                  />
                </div>

                {/* Error Message */}
                {submitError && (
                  <div className="neon-card p-4 border-red-500/30 bg-red-500/10">
                    <p className="text-sm text-red-400 font-medium">{submitError}</p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full pill-neon px-6 py-3.5 border transition-all duration-300 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                    selectedTier === 'analyst' 
                      ? 'bg-gradient-neon-pink text-black border-akari-neon-violet/50 shadow-neon-pink hover:shadow-akari-glow' 
                      : 'bg-gradient-neon-pink text-black border-akari-neon-pink/50 shadow-neon-pink hover:shadow-akari-glow'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                      Sending request...
                    </>
                  ) : (
                    'Send upgrade request'
                  )}
                </button>
              </form>
            ) : (
              <div className="neon-card p-5 border-emerald-500/30 bg-emerald-500/10">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-emerald-400 mb-1">Request sent!</p>
                    <p className="text-xs text-emerald-300/80 leading-relaxed">
                      Your upgrade request has been sent. The AKARI team will review and contact you.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Alternative Contact Options */}
            {!submitSuccess && (
              <div className="mt-6 pt-6 border-t border-akari-neon-teal/20 flex gap-3">
                <a
                  href={getContactLink()}
                  className="flex-1 pill-neon px-5 py-2.5 bg-akari-cardSoft/50 text-akari-text hover:bg-akari-cardSoft border border-akari-neon-teal/20 hover:border-akari-neon-teal/40 transition-all duration-300 text-sm font-semibold text-center"
                >
                  Contact AKARI team
                </a>
                <Link
                  href="/portal/pricing"
                  className="flex-1 pill-neon px-5 py-2.5 bg-akari-cardSoft/50 text-akari-text hover:bg-akari-cardSoft border border-akari-neon-teal/20 hover:border-akari-neon-teal/40 transition-all duration-300 text-sm font-semibold text-center"
                >
                  View Pricing
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Already at highest tier */}
        {!canUpgradeToAnalyst && !canUpgradeToInstitutional && (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-neon-pink flex items-center justify-center shadow-neon-pink">
              <svg
                className="w-10 h-10 text-black"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gradient-neon mb-3">
              You&apos;re at the highest tier!
            </h3>
            <p className="text-sm text-akari-muted leading-relaxed">
              You currently have {currentTierInfo.name} access with all features unlocked.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-akari-neon-teal/20">
          <p className="text-xs text-akari-muted text-center">
            Questions?{' '}
            <a href={getContactLink()} className="text-gradient-teal hover:text-akari-neon-teal transition-all duration-300 font-semibold">
              Contact the AKARI team
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

