/**
 * AKARI Mystic Club - Locked Overlay Component
 * 
 * Displays a welcome overlay for unauthenticated visitors.
 * The page content behind is faded and non-interactive.
 */

import React, { useState } from 'react';
import Image from 'next/image';

interface LockedOverlayProps {
  onLogin: () => void;
}

export function LockedOverlay({ onLogin }: LockedOverlayProps) {
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const handleLogin = () => {
    if (acceptedTerms) {
      onLogin();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-akari-bg/80 backdrop-blur-sm">
      <div className="max-w-lg mx-4 p-8 rounded-3xl border border-akari-border/50 bg-akari-card shadow-2xl">
        {/* Mystic Heros Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-4">
            <Image 
              src="/mystic-heros-logo.png" 
              alt="Mystic Heros"
              width={120}
              height={120}
              className="rounded-2xl"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-akari-text mb-2">
            Welcome to AKARI Mystic Club
          </h1>
        </div>

        {/* Welcome Message */}
        <div className="text-sm text-akari-muted leading-relaxed space-y-4 mb-6">
          <p>
            This platform reads signals from your favorite X accounts, so step lightly... 
            and leave your shoes and socks at the door.
          </p>
          <p>
            Our sentiment engine and inner circle mapping follow{' '}
            <a 
              href="https://x.com/Muazxinthi" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-akari-primary hover:underline"
            >
              @Muazxinthi
            </a>
            &apos;s way of decoding CT signals. We are growing fast, but still maturing, 
            so more data and deeper insights are coming.
          </p>
        </div>

        {/* Terms & Conditions Checkbox */}
        <div className="mb-6">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-5 h-5 rounded border-2 border-akari-border bg-akari-cardSoft peer-checked:bg-akari-primary peer-checked:border-akari-primary transition-all flex items-center justify-center">
                {acceptedTerms && (
                  <svg className="w-3 h-3 text-akari-bg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm text-akari-muted group-hover:text-akari-text transition">
              I agree to the{' '}
              <a 
                href="/terms" 
                target="_blank"
                className="text-akari-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Terms & Conditions
              </a>
              {' '}and{' '}
              <a 
                href="/privacy" 
                target="_blank"
                className="text-akari-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Privacy Policy
              </a>
            </span>
          </label>
        </div>

        {/* Login Button */}
        <button
          onClick={handleLogin}
          disabled={!acceptedTerms}
          className={`w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl font-medium transition-all transform border ${
            acceptedTerms
              ? 'bg-black hover:bg-zinc-900 text-white hover:scale-[1.02] active:scale-[0.98] border-zinc-700 cursor-pointer'
              : 'bg-zinc-800/50 text-zinc-500 border-zinc-800 cursor-not-allowed'
          }`}
        >
          {/* X Logo */}
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
          Log in with X to enter
        </button>

        {/* Footer hint */}
        {!acceptedTerms && (
          <p className="mt-4 text-center text-xs text-akari-muted animate-pulse">
            ☝️ Please accept the Terms & Conditions to continue
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Wrapper component that applies the locked overlay logic.
 * Wraps children with faded content when not logged in.
 */
interface AuthGateProps {
  children: React.ReactNode;
  isLoggedIn: boolean;
  isLoading: boolean;
  onLogin: () => void;
}

export function AuthGate({ children, isLoggedIn, isLoading, onLogin }: AuthGateProps) {
  // While loading, show a subtle loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-akari-bg flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
      </div>
    );
  }

  // If logged in, render children normally
  if (isLoggedIn) {
    return <>{children}</>;
  }

  // If not logged in, show faded content with overlay
  return (
    <>
      {/* Faded, non-interactive content */}
      <div 
        className="opacity-25 pointer-events-none select-none"
        aria-hidden="true"
      >
        {children}
      </div>
      
      {/* Login overlay */}
      <LockedOverlay onLogin={onLogin} />
    </>
  );
}

export default LockedOverlay;

