/**
 * Analyst Social Boost Promo Modal
 * 
 * Modal that offers Seer users a quest to unlock 3 days of Analyst access
 * by following @MysticHeros and posting a tweet with akarimystic.club.
 */

import React from 'react';

// =============================================================================
// CONFIGURATION
// =============================================================================

const TARGET_X_HANDLE = 'MysticHeros';
const TARGET_X_URL = `https://x.com/${TARGET_X_HANDLE}`;
const REQUIRED_MENTION = 'akarimystic.club';

// =============================================================================
// TYPES
// =============================================================================

export interface AnalystPromoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: string;
  onAccept: () => void;
  onSkip: () => void;
  onNever: () => void;
  onVerify: () => void;
  isDeciding: boolean;
  isVerifying: boolean;
  verifyError: string | null;
  grantedUntil: string | null;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AnalystPromoModal({
  open,
  onOpenChange,
  status,
  onAccept,
  onSkip,
  onNever,
  onVerify,
  isDeciding,
  isVerifying,
  verifyError,
  grantedUntil,
}: AnalystPromoModalProps) {
  if (!open) return null;

  const isAccepted = status === 'accepted';
  const isCompleted = status === 'completed';

  // Format the expiry date nicely
  const formattedExpiry = grantedUntil
    ? new Date(grantedUntil).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="neon-card border-2 border-akari-neon-violet/40 rounded-2xl p-6 sm:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-[0_0_40px_rgba(168,85,247,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-akari-neon-violet to-akari-neon-pink flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.4)]">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gradient-pink">
              Analyst Social Boost
            </h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-akari-muted hover:text-akari-neon-violet transition-all duration-300 hover:drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Success State */}
        {isCompleted && (
          <div className="space-y-6">
            <div className="neon-card p-6 border-emerald-500/30 bg-emerald-500/10 rounded-xl">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-emerald-400 mb-2">
                    🎉 Quest Complete!
                  </h3>
                  <p className="text-sm text-emerald-300/90 leading-relaxed mb-3">
                    You&apos;ve unlocked <span className="font-semibold">3 days of Analyst mode</span>. 
                    Enjoy full analytics, competitor comparisons, and advanced search.
                  </p>
                  {formattedExpiry && (
                    <p className="text-xs text-emerald-300/70">
                      Access valid until: <span className="font-medium">{formattedExpiry}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => onOpenChange(false)}
              className="w-full pill-neon px-6 py-3 bg-gradient-to-r from-emerald-500 to-akari-neon-teal text-black font-semibold shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_30px_rgba(16,185,129,0.6)] transition-all duration-300"
            >
              Start Exploring
            </button>
          </div>
        )}

        {/* Quest Instructions (Before/After Accept) */}
        {!isCompleted && (
          <div className="space-y-6">
            {/* Description */}
            <p className="text-sm text-akari-text leading-relaxed">
              Complete this quick quest to unlock <span className="text-akari-neon-violet font-semibold">3 days of Analyst mode</span> for free! 
              Get access to competitor analysis, advanced search, and full analytics.
            </p>

            {/* Steps */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-akari-muted uppercase tracking-wider">
                Quest Steps
              </h3>
              
              <div className="space-y-2">
                {/* Step 1: Follow */}
                <div className="neon-card neon-hover p-4 border border-akari-neon-violet/20 rounded-xl flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-akari-neon-violet/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-akari-neon-violet">
                    1
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-akari-text font-medium">
                      Follow{' '}
                      <a
                        href={TARGET_X_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-akari-neon-violet hover:underline"
                      >
                        @{TARGET_X_HANDLE}
                      </a>
                      {' '}on X
                    </p>
                  </div>
                  <a
                    href={TARGET_X_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pill-neon px-3 py-1.5 text-xs font-medium border border-akari-neon-violet/30 text-akari-neon-violet hover:bg-akari-neon-violet/10 transition-all duration-300"
                  >
                    Open
                  </a>
                </div>

                {/* Step 2: Tweet */}
                <div className="neon-card neon-hover p-4 border border-akari-neon-violet/20 rounded-xl flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-akari-neon-violet/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-akari-neon-violet">
                    2
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-akari-text font-medium mb-1">
                      Post a tweet that includes:
                    </p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <code className="px-2 py-0.5 rounded bg-akari-cardSoft text-xs text-akari-neon-teal">
                        {REQUIRED_MENTION}
                      </code>
                      <code className="px-2 py-0.5 rounded bg-akari-cardSoft text-xs text-akari-neon-teal">
                        @{TARGET_X_HANDLE}
                      </code>
                    </div>
                  </div>
                  <a
                    href={`https://x.com/intent/tweet?text=${encodeURIComponent(`Just discovered ${REQUIRED_MENTION} - the best crypto market intelligence platform! 🔥\n\n@${TARGET_X_HANDLE}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pill-neon px-3 py-1.5 text-xs font-medium bg-akari-neon-violet/10 border border-akari-neon-violet/30 text-akari-neon-violet hover:bg-akari-neon-violet/20 transition-all duration-300 flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    Tweet
                  </a>
                </div>

                {/* Step 3: Verify */}
                <div className="neon-card neon-hover p-4 border border-akari-neon-violet/20 rounded-xl flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-akari-neon-violet/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-akari-neon-violet">
                    3
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-akari-text font-medium">
                      Click Verify to check your progress
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {verifyError && (
              <div className="neon-card p-4 border-red-500/30 bg-red-500/10 rounded-xl">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm text-red-400 font-medium">Verification failed</p>
                    <p className="text-xs text-red-300/80 mt-1">{verifyError}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              {!isAccepted ? (
                <>
                  {/* Start Quest Button */}
                  <button
                    onClick={onAccept}
                    disabled={isDeciding}
                    className="w-full pill-neon px-6 py-3.5 bg-gradient-to-r from-akari-neon-violet to-akari-neon-pink text-white font-semibold shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isDeciding ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
                        </svg>
                        Start Quest
                      </>
                    )}
                  </button>

                  {/* Secondary Actions */}
                  <div className="flex gap-3">
                    <button
                      onClick={onSkip}
                      disabled={isDeciding}
                      className="flex-1 pill-neon px-4 py-2.5 text-sm font-medium border border-akari-neon-teal/30 text-akari-muted hover:text-akari-neon-teal hover:border-akari-neon-teal/50 transition-all duration-300 disabled:opacity-50"
                    >
                      Not now
                    </button>
                    <button
                      onClick={onNever}
                      disabled={isDeciding}
                      className="pill-neon px-4 py-2.5 text-sm font-medium border border-akari-muted/30 text-akari-muted/70 hover:text-akari-muted hover:border-akari-muted/50 transition-all duration-300 disabled:opacity-50"
                    >
                      Never show
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Verify Button (after accepting) */}
                  <button
                    onClick={onVerify}
                    disabled={isVerifying}
                    className="w-full pill-neon px-6 py-3.5 bg-gradient-to-r from-akari-neon-violet to-akari-neon-pink text-white font-semibold shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isVerifying ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Checking your tweet and follow...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Verify Now
                      </>
                    )}
                  </button>

                  {/* Skip for now */}
                  <button
                    onClick={onSkip}
                    disabled={isDeciding || isVerifying}
                    className="w-full pill-neon px-4 py-2.5 text-sm font-medium border border-akari-neon-teal/30 text-akari-muted hover:text-akari-neon-teal hover:border-akari-neon-teal/50 transition-all duration-300 disabled:opacity-50"
                  >
                    Finish later
                  </button>
                </>
              )}
            </div>

            {/* Footer Note */}
            <p className="text-xs text-akari-muted/70 text-center">
              After completing the quest, you&apos;ll have 3 days to explore Analyst features.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default AnalystPromoModal;

