/**
 * Upgrade Modal Component
 * 
 * Modal that explains how to upgrade using manual crypto payments and admin approval.
 * No automation - purely informational UI.
 */

import React from 'react';
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
 */
export function UpgradeModal({ isOpen, onClose, user }: UpgradeModalProps) {
  if (!isOpen) return null;

  const currentTier = getUserTier(user);
  const currentTierInfo = TIER_INFO[currentTier];
  const canUpgradeToAnalyst = canUpgradeTo(user, 'analyst');
  const canUpgradeToInstitutional = canUpgradeTo(user, 'institutional_plus');

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Upgrade your AKARI access</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
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
        <div className="mb-6 p-4 rounded-lg bg-slate-800/50 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">Your Current Level</div>
          <div className={`text-lg font-semibold ${currentTierInfo.color}`}>
            {currentTierInfo.name}
          </div>
        </div>

        {/* Upgrade to Analyst */}
        {canUpgradeToAnalyst && (
          <div className="mb-6 p-5 rounded-lg border border-purple-500/30 bg-purple-500/5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2">Analyst</h3>
                <p className="text-sm text-slate-300 mb-3">
                  Designed for active CT analysts, founders, and creators.
                </p>
                <p className="text-sm text-slate-300 mb-3">
                  Unlock full competitor analysis, advanced Twitter analytics, CSV exports, and richer narrative tools.
                </p>
                <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    To upgrade, contact the AKARI team with your X handle and desired tier. You will receive a crypto payment address and simple instructions. Once your transaction is confirmed on-chain, your account will be upgraded manually.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <a
                href={getContactLink()}
                className="flex-1 px-4 py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/50 transition text-sm font-medium text-center"
              >
                Contact AKARI team
              </a>
              <Link
                href="/portal/pricing"
                className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition text-sm font-medium text-center"
              >
                View Pricing
              </Link>
            </div>
          </div>
        )}

        {/* Upgrade to Institutional Plus */}
        {canUpgradeToInstitutional && (
          <div className="mb-6 p-5 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2">Institutional Plus</h3>
                <p className="text-sm text-slate-300 mb-3">
                  For funds, desks, and large teams that need deeper coverage.
                </p>
                <p className="text-sm text-slate-300 mb-3">
                  Includes everything in Analyst plus Deep Explorer, 90 day sentiment, inner circle reach, and custom support.
                </p>
                <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Institutional Plus is invite only. Contact the AKARI team to discuss access.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <a
                href={getContactLink()}
                className="flex-1 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/50 transition text-sm font-medium text-center"
              >
                Contact AKARI team
              </a>
              <Link
                href="/portal/pricing"
                className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition text-sm font-medium text-center"
              >
                View Pricing
              </Link>
            </div>
          </div>
        )}

        {/* Already at highest tier */}
        {!canUpgradeToAnalyst && !canUpgradeToInstitutional && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-amber-400"
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
            <h3 className="text-lg font-semibold text-white mb-2">
              You&apos;re at the highest tier!
            </h3>
            <p className="text-sm text-slate-400">
              You currently have {currentTierInfo.name} access with all features unlocked.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-6 border-t border-slate-800">
          <p className="text-xs text-slate-500 text-center">
            Questions?{' '}
            <a href={getContactLink()} className="text-akari-primary hover:underline">
              Contact the AKARI team
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

