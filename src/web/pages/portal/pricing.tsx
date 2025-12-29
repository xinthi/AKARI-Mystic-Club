/**
 * Pricing Page
 * 
 * Displays tier information and feature comparison.
 * No real billing - just informational UI.
 */

import { useState } from 'react';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { getUserTierInfo, getUserTier, TIER_INFO, type UserTier } from '@/lib/userTier';
import { UpgradeModal } from '@/components/portal/UpgradeModal';

// =============================================================================
// TYPES
// =============================================================================

interface FeatureList {
  included: string[];
  excluded?: string[];
}

const TIER_FEATURES: Record<UserTier, FeatureList> = {
  seer: {
    included: [
      'Sentiment overview dashboard',
      'Project detail pages',
      'Watchlist (up to 5 projects)',
      'Basic charts and topic stats',
      'AKARI score viewing',
      'Market overview',
    ],
  },
  analyst: {
    included: [
      'Everything in Seer',
      'Competitor comparison tool',
      'Twitter Analytics section',
      'CSV export for analytics',
      'Advanced search and filtering',
      'Narrative heatmap full access',
      'Watchlist (up to 20 projects)',
      'Extended analytics windows',
    ],
  },
  institutional_plus: {
    included: [
      'Everything in Analyst',
      'Deep Explorer access',
      '90-day analytics windows',
      'Inner Circle Reach analysis',
      'Advanced topic clustering',
      'Custom export formats',
      'Priority support',
      'Watchlist (up to 100 projects)',
      'Enterprise-grade insights',
    ],
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

export default function PricingPage() {
  const akariUser = useAkariUser();
  const tierInfo = getUserTierInfo(akariUser.user);
  const currentTier = getUserTier(akariUser.user);
  const [upgradeModalState, setUpgradeModalState] = useState<{ open: boolean; targetTier?: 'analyst' | 'institutional_plus' }>({
    open: false,
  });

  return (
    <PortalLayout title="Pricing">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-4 text-gradient-neon">Choose Your Tier</h1>
          <p className="text-akari-muted max-w-2xl mx-auto text-base leading-relaxed">
            Select the level of access that fits your needs. All tiers include core sentiment
            tracking and project insights.
          </p>

          {/* Current Tier Badge */}
          {akariUser.isLoggedIn && (
            <div className="mt-8 inline-flex items-center gap-3 pill-neon px-5 py-2.5 bg-akari-cardSoft/50 border border-akari-neon-teal/30">
              <span className="text-xs text-akari-muted uppercase tracking-wider">Your current level:</span>
              <span className={`text-sm font-semibold ${tierInfo.color}`}>{tierInfo.name}</span>
            </div>
          )}
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {/* Seer Tier */}
          <div className="neon-card neon-hover p-8">
            <div className="mb-8">
              <div className="text-akari-neon-blue text-xs font-semibold uppercase tracking-wider mb-3">FREE TIER</div>
              <h2 className="text-3xl font-bold text-gradient-blue mb-3">Seer</h2>
              <div className="text-4xl font-bold text-gradient-neon mb-2">Free</div>
              <p className="text-sm text-akari-muted">Perfect for casual tracking</p>
            </div>

            <ul className="space-y-4 mb-8">
              {TIER_FEATURES.seer.included.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-akari-text">
                  <svg
                    className="w-5 h-5 text-akari-neon-blue flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <div className="pt-6 border-t border-akari-neon-teal/20">
              <div className="text-xs text-akari-muted text-center">
                Default access level
              </div>
            </div>
          </div>

          {/* Analyst Tier */}
          <div className="neon-card neon-hover p-8 border-2 border-akari-neon-violet/50 relative">
            {tierInfo.key === 'analyst' && (
              <div className="absolute top-6 right-6 pill-neon px-3 py-1.5 bg-akari-neon-violet/20 text-akari-neon-violet text-xs font-semibold border border-akari-neon-violet/30">
                Your Tier
              </div>
            )}
            <div className="mb-8">
              <div className="text-akari-neon-violet text-xs font-semibold uppercase tracking-wider mb-3">PAID TIER</div>
              <h2 className="text-3xl font-bold text-gradient-pink mb-3">Analyst</h2>
              <div className="text-4xl font-bold text-gradient-neon mb-2">N/A</div>
              <p className="text-sm text-akari-muted">Contact for pricing</p>
            </div>

            <ul className="space-y-4 mb-8">
              {TIER_FEATURES.analyst.included.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-akari-text">
                  <svg
                    className="w-5 h-5 text-akari-neon-violet flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <div className="pt-6 border-t border-akari-neon-violet/20">
              {tierInfo.key === 'analyst' ? (
                <div className="text-xs text-akari-neon-violet text-center font-semibold">
                  ✓ You have this tier
                </div>
              ) : (
                <button
                  onClick={() => setUpgradeModalState({ open: true, targetTier: 'analyst' })}
                  className="w-full pill-neon px-4 py-2.5 bg-akari-neon-violet/20 text-akari-neon-violet hover:bg-akari-neon-violet/30 border border-akari-neon-violet/50 transition-all duration-300 text-sm font-semibold hover:shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                >
                  Request Upgrade
                </button>
              )}
            </div>
          </div>

          {/* Institutional Plus Tier */}
          <div className="neon-card neon-hover p-8 border-2 border-akari-neon-pink/50 relative">
            {tierInfo.key === 'institutional_plus' && (
              <div className="absolute top-6 right-6 pill-neon px-3 py-1.5 bg-akari-neon-pink/20 text-akari-neon-pink text-xs font-semibold border border-akari-neon-pink/30">
                Your Tier
              </div>
            )}
            <div className="mb-8">
              <div className="text-akari-neon-pink text-xs font-semibold uppercase tracking-wider mb-3">ENTERPRISE</div>
              <h2 className="text-3xl font-bold text-gradient-pink mb-3">Institutional Plus</h2>
              <div className="text-4xl font-bold text-gradient-neon mb-2">N/A</div>
              <p className="text-sm text-akari-muted">Custom pricing</p>
            </div>

            <ul className="space-y-4 mb-8">
              {TIER_FEATURES.institutional_plus.included.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-akari-text">
                  <svg
                    className="w-5 h-5 text-akari-neon-pink flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <div className="pt-6 border-t border-akari-neon-pink/20">
              {tierInfo.key === 'institutional_plus' ? (
                <div className="text-xs text-akari-neon-pink text-center font-semibold">
                  ✓ You have this tier
                </div>
              ) : (
                <button
                  onClick={() => setUpgradeModalState({ open: true, targetTier: 'institutional_plus' })}
                  className="w-full pill-neon px-4 py-2.5 bg-akari-neon-pink/20 text-akari-neon-pink hover:bg-akari-neon-pink/30 border border-akari-neon-pink/50 transition-all duration-300 text-sm font-semibold hover:shadow-[0_0_12px_rgba(255,16,240,0.3)]"
                >
                  Contact Team
                </button>
              )}
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="neon-card neon-hover p-8 mb-16">
          <h2 className="text-2xl font-bold text-gradient-neon mb-8">How Upgrades Work</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="w-12 h-12 rounded-full bg-gradient-neon-teal flex items-center justify-center mb-4 shadow-neon-teal">
                <span className="text-black font-bold text-lg">1</span>
              </div>
              <h3 className="text-base font-semibold text-akari-text mb-2">Contact Us</h3>
              <p className="text-sm text-akari-muted leading-relaxed">
                Reach out with your X handle and desired tier. We&apos;ll respond with payment
                instructions.
              </p>
            </div>
            <div>
              <div className="w-12 h-12 rounded-full bg-gradient-neon-blue flex items-center justify-center mb-4 shadow-neon-blue">
                <span className="text-black font-bold text-lg">2</span>
              </div>
              <h3 className="text-base font-semibold text-akari-text mb-2">Make Payment</h3>
              <p className="text-sm text-akari-muted leading-relaxed">
                Send crypto payment to the address provided. We&apos;ll work with you to create a plan that fits your needs.
              </p>
            </div>
            <div>
              <div className="w-12 h-12 rounded-full bg-gradient-neon-pink flex items-center justify-center mb-4 shadow-neon-pink">
                <span className="text-black font-bold text-lg">3</span>
              </div>
              <h3 className="text-base font-semibold text-akari-text mb-2">Get Upgraded</h3>
              <p className="text-sm text-akari-muted leading-relaxed">
                After on-chain confirmation, we&apos;ll manually upgrade your account within 24 hours.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-akari-muted mb-6 text-base">Ready to upgrade?</p>
          <button
            onClick={() => setUpgradeModalState({ 
              open: true, 
              targetTier: currentTier === 'seer' ? 'analyst' : 'institutional_plus' 
            })}
            className="pill-neon px-8 py-3.5 bg-gradient-neon-teal text-black hover:shadow-akari-glow transition-all duration-300 font-semibold text-base"
          >
            Request Upgrade
          </button>
        </div>
      </div>

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={upgradeModalState.open}
        onClose={() => setUpgradeModalState({ open: false })}
        user={akariUser.user}
        targetTier={upgradeModalState.targetTier}
      />
    </PortalLayout>
  );
}

