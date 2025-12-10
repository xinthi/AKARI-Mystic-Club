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
        <div className="text-center mb-12">
          <h1 className="text-3xl font-semibold text-white mb-3">Choose Your Tier</h1>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Select the level of access that fits your needs. All tiers include core sentiment
            tracking and project insights.
          </p>

          {/* Current Tier Badge */}
          {akariUser.isLoggedIn && (
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700">
              <span className="text-xs text-slate-400">Your current level:</span>
              <span className={`text-sm font-semibold ${tierInfo.color}`}>{tierInfo.name}</span>
            </div>
          )}
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Seer Tier */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <div className="mb-6">
              <div className="text-blue-400 text-sm font-medium mb-2">FREE TIER</div>
              <h2 className="text-2xl font-semibold text-white mb-2">Seer</h2>
              <div className="text-3xl font-bold text-white mb-1">Free</div>
              <p className="text-xs text-slate-400">Perfect for casual tracking</p>
            </div>

            <ul className="space-y-3 mb-6">
              {TIER_FEATURES.seer.included.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                  <svg
                    className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
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

            <div className="pt-6 border-t border-slate-800">
              <div className="text-xs text-slate-500 text-center">
                Default access level
              </div>
            </div>
          </div>

          {/* Analyst Tier */}
          <div className="bg-slate-900/60 border-2 border-purple-500/50 rounded-2xl p-6 relative">
            {tierInfo.key === 'analyst' && (
              <div className="absolute top-4 right-4 px-2 py-1 rounded-full bg-purple-500/20 text-purple-400 text-xs font-medium border border-purple-500/30">
                Your Tier
              </div>
            )}
            <div className="mb-6">
              <div className="text-purple-400 text-sm font-medium mb-2">PAID TIER</div>
              <h2 className="text-2xl font-semibold text-white mb-2">Analyst</h2>
              <div className="text-3xl font-bold text-white mb-1">—</div>
              <p className="text-xs text-slate-400">Contact for pricing</p>
            </div>

            <ul className="space-y-3 mb-6">
              {TIER_FEATURES.analyst.included.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                  <svg
                    className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5"
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

            <div className="pt-6 border-t border-slate-800">
              {tierInfo.key === 'analyst' ? (
                <div className="text-xs text-purple-400 text-center font-medium">
                  ✓ You have this tier
                </div>
              ) : (
                <button
                  onClick={() => setUpgradeModalState({ open: true, targetTier: 'analyst' })}
                  className="w-full px-4 py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/50 transition text-sm font-medium"
                >
                  Request Upgrade
                </button>
              )}
            </div>
          </div>

          {/* Institutional Plus Tier */}
          <div className="bg-slate-900/60 border border-amber-500/30 rounded-2xl p-6 relative">
            {tierInfo.key === 'institutional_plus' && (
              <div className="absolute top-4 right-4 px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium border border-amber-500/30">
                Your Tier
              </div>
            )}
            <div className="mb-6">
              <div className="text-amber-400 text-sm font-medium mb-2">ENTERPRISE</div>
              <h2 className="text-2xl font-semibold text-white mb-2">Institutional Plus</h2>
              <div className="text-3xl font-bold text-white mb-1">—</div>
              <p className="text-xs text-slate-400">Custom pricing</p>
            </div>

            <ul className="space-y-3 mb-6">
              {TIER_FEATURES.institutional_plus.included.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                  <svg
                    className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5"
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

            <div className="pt-6 border-t border-slate-800">
              {tierInfo.key === 'institutional_plus' ? (
                <div className="text-xs text-amber-400 text-center font-medium">
                  ✓ You have this tier
                </div>
              ) : (
                <button
                  onClick={() => setUpgradeModalState({ open: true, targetTier: 'institutional_plus' })}
                  className="w-full px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/50 transition text-sm font-medium"
                >
                  Contact Team
                </button>
              )}
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 mb-12">
          <h2 className="text-xl font-semibold text-white mb-4">How Upgrades Work</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="w-10 h-10 rounded-full bg-akari-primary/20 flex items-center justify-center mb-3">
                <span className="text-akari-primary font-semibold">1</span>
              </div>
              <h3 className="text-sm font-semibold text-white mb-2">Contact Us</h3>
              <p className="text-xs text-slate-400">
                Reach out with your X handle and desired tier. We&apos;ll respond with payment
                instructions.
              </p>
            </div>
            <div>
              <div className="w-10 h-10 rounded-full bg-akari-primary/20 flex items-center justify-center mb-3">
                <span className="text-akari-primary font-semibold">2</span>
              </div>
                <h3 className="text-sm font-semibold text-white mb-2">Make Payment</h3>
              <p className="text-xs text-slate-400">
                Send crypto payment to the address provided. We&apos;ll work with you to create a plan that fits your needs.
              </p>
            </div>
            <div>
              <div className="w-10 h-10 rounded-full bg-akari-primary/20 flex items-center justify-center mb-3">
                <span className="text-akari-primary font-semibold">3</span>
              </div>
              <h3 className="text-sm font-semibold text-white mb-2">Get Upgraded</h3>
              <p className="text-xs text-slate-400">
                After on-chain confirmation, we&apos;ll manually upgrade your account within 24 hours.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-slate-400 mb-4">Ready to upgrade?</p>
          <button
            onClick={() => setUpgradeModalState({ 
              open: true, 
              targetTier: currentTier === 'seer' ? 'analyst' : 'institutional_plus' 
            })}
            className="px-6 py-3 rounded-lg bg-akari-primary text-black hover:opacity-90 transition font-medium"
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

