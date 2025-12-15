import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Logo } from '../Logo';
import { useAkariUser } from '@/lib/akari-auth';
import { getUserTierInfo, getUserTier } from '@/lib/userTier';
import { UpgradeModal } from './UpgradeModal';
import { UserMenu } from './UserMenu';
import { AnalystPromoModal } from './AnalystPromoModal';
import { useAnalystPromo } from '@/hooks/useAnalystPromo';
import { isSuperAdmin } from '@/lib/permissions';

type Props = {
  title?: string;
  children: React.ReactNode;
};

const navItems = [
  { href: '/portal', label: 'home', isTesting: false },
  { href: '/portal/markets', label: 'markets', isTesting: true },
  { href: '/portal/memes', label: 'meme radar', isTesting: true },
  { href: '/portal/sentiment', label: 'sentiment', isTesting: false },
  { href: '/portal/arc', label: 'arc', isTesting: false },
  { href: '/portal/new-launches', label: 'new launches', isTesting: true },
  { href: '/portal/pricing', label: 'pricing', isTesting: false },
];

export function PortalLayout({ title = 'Akari Mystic Club', children }: Props) {
  const router = useRouter();
  const akariUser = useAkariUser();
  const { isLoggedIn } = akariUser;
  const tierInfo = getUserTierInfo(akariUser.user);
  const currentTier = getUserTier(akariUser.user);
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);
  const [upgradeModalState, setUpgradeModalState] = useState<{ open: boolean; targetTier?: 'analyst' | 'institutional_plus' }>({
    open: false,
  });
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Analyst Social Boost Promo
  const promo = useAnalystPromo();

  // Filter nav items based on environment and user permissions
  // Use useMemo to recalculate when user loads/changes
  // Reuse the same Super Admin check used for ARC Admin button
  const visibleNavItems = useMemo(() => {
    // Check dev mode bypass (same as yellow DEV MODE panel)
    const isDevBypass = process.env.NODE_ENV === 'development';
    // Check Super Admin status (same logic as ARC Admin button on /portal/arc)
    const isSuperAdminUser = isSuperAdmin(akariUser.user);
    // ARC is visible to SuperAdmins in production, everyone in dev
    const canSeeArc = isDevBypass || isSuperAdminUser;
    
    return navItems.filter((item) => {
      // ARC link: show to SuperAdmins in production, everyone in dev
      if (item.href === '/portal/arc') {
        return canSeeArc;
      }
      return true;
    });
  }, [akariUser.user]);

  // Lock body scroll when mobile nav is open
  useEffect(() => {
    if (isMobileNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileNavOpen]);

  // Close mobile nav when route changes
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [router.pathname]);

  return (
    <>
      <Head>
        <title>{title} – Akari Mystic Club</title>
      </Head>
      <div className="min-h-screen bg-akari-bg text-akari-text">
      {/* Top nav */}
      <header className="border-b border-akari-neon-teal/30 bg-black/80 backdrop-blur-xl relative z-50">
        {/* Soft neon bottom glow under header */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-akari-neon-teal/80 to-transparent blur-sm"></div>
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-akari-neon-teal/60 to-transparent"></div>
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 px-4 py-4">
          {/* Hamburger + Logo */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Hamburger menu button */}
            <button
              onClick={() => setIsMobileNavOpen(true)}
              className="p-2 rounded-lg border border-akari-neon-teal/40 bg-akari-neon-teal/10 text-akari-neon-teal hover:border-akari-neon-teal hover:bg-akari-neon-teal/20 hover:drop-shadow-[0_0_12px_rgba(0,246,162,0.6)] transition-all duration-300 ease-out flex-shrink-0"
              aria-label="Open navigation menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Logo + brand */}
            <Link href="/portal" className="flex items-center gap-2 transition-all duration-300 ease-out hover:scale-105 flex-shrink-0">
              <div className="transition-all duration-300 hover:drop-shadow-[0_0_8px_rgba(0,246,162,0.6)] flex-shrink-0">
                <Logo size={28} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] tracking-[0.18em] uppercase text-gradient-teal font-medium whitespace-nowrap">
                  Akari Mystic Club
                </span>
                <span className="text-[9px] text-akari-muted/60 hidden sm:block tracking-wider whitespace-nowrap">
                  PREDICT.SHARE.INTELLIGENCE
                </span>
              </div>
            </Link>
          </div>

          {/* Nav links - hidden on mobile, shown on desktop */}
          <nav className="hidden sm:flex flex-wrap items-center gap-2 sm:gap-3 text-xs w-full sm:w-auto">
            {visibleNavItems.map((item) => {
              const active =
                router.pathname === item.href ||
                (item.href !== '/portal' && router.pathname.startsWith(item.href));
              
              // Render disabled items as non-clickable spans
              if (item.isTesting) {
                return (
                  <span
                    key={item.href}
                    className="pill-neon font-medium border transition-all duration-300 ease-out flex flex-col items-center justify-center px-3 py-1.5 cursor-not-allowed opacity-50 text-akari-muted/40 border-akari-muted/20 bg-akari-muted/5"
                    title="Coming soon"
                  >
                    <span className="text-xs whitespace-nowrap">{item.label}</span>
                    <span className="text-[8px] text-amber-500/70 font-normal leading-tight">coming soon</span>
                  </span>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`pill-neon font-medium border transition-all duration-300 ease-out flex flex-col items-center justify-center px-3 py-1.5 ${
                    active
                      ? 'text-black bg-gradient-neon-teal border-akari-neon-teal/50 shadow-neon-teal'
                      : 'text-akari-muted border-akari-neon-teal/30 hover:text-akari-neon-teal hover:border-akari-neon-teal/60 hover:bg-akari-neon-teal/5 hover:shadow-[0_0_12px_rgba(0,246,162,0.2)]'
                  }`}
                >
                  <span className="text-xs whitespace-nowrap">{item.label}</span>
                </Link>
              );
            })}

            {/* Tier Badge - only show when logged in */}
            {isLoggedIn && (
              <button
                onClick={() => {
                  if (currentTier === 'seer') {
                    setUpgradeModalState({ open: true, targetTier: 'analyst' });
                  } else if (currentTier === 'analyst') {
                    setUpgradeModalState({ open: true, targetTier: 'institutional_plus' });
                  } else {
                    router.push('/portal/pricing');
                  }
                }}
                className={`pill-neon flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium border border-akari-neon-teal/40 whitespace-nowrap transition-all duration-300 ease-out ${tierInfo.bgColor} ${tierInfo.color} hover:border-akari-neon-teal/60 hover:shadow-[0_0_12px_rgba(0,246,162,0.3)]`}
                title={`Your current tier: ${tierInfo.name}`}
              >
                <span className="hidden sm:inline">Level:</span>
                {currentTier === 'seer' ? `${tierInfo.name} · Upgrade` : 
                 currentTier === 'analyst' ? `${tierInfo.name} · Manage` : 
                 tierInfo.name}
              </button>
            )}

            {/* User Menu Dropdown - replaces Profile and Admin links */}
            {isLoggedIn && <UserMenu />}
          </nav>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {isMobileNavOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] sm:hidden"
            onClick={() => setIsMobileNavOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer */}
          <div className="fixed left-0 top-0 bottom-0 w-[80%] max-w-sm bg-akari-card border-r border-akari-neon-teal/30 shadow-[0_0_30px_rgba(0,246,162,0.3)] z-[70] sm:hidden overflow-y-auto transform transition-transform duration-300 ease-out">
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-4 border-b border-akari-neon-teal/20">
              <Link
                href="/portal"
                onClick={() => setIsMobileNavOpen(false)}
                className="flex items-center gap-2 transition-all duration-300 ease-out hover:scale-105 flex-shrink-0"
              >
                <div className="transition-all duration-300 hover:drop-shadow-[0_0_8px_rgba(0,246,162,0.6)] flex-shrink-0">
                  <Logo size={28} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] tracking-[0.18em] uppercase text-gradient-teal font-medium whitespace-nowrap">
                    Akari Mystic Club
                  </span>
                  <span className="text-[9px] text-akari-muted/60 tracking-wider whitespace-nowrap">
                    PREDICT.SHARE.INTELLIGENCE
                  </span>
                </div>
              </Link>
              <button
                onClick={() => setIsMobileNavOpen(false)}
                className="p-2 text-akari-muted hover:text-akari-neon-teal transition-all duration-300 ease-out hover:drop-shadow-[0_0_8px_rgba(0,246,162,0.5)]"
                aria-label="Close navigation menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex flex-col p-4 space-y-4">
              {/* Navigation Items */}
              <nav className="flex flex-col space-y-2">
                {visibleNavItems.map((item) => {
                  const active =
                    router.pathname === item.href ||
                    (item.href !== '/portal' && router.pathname.startsWith(item.href));
                  
                  // Render disabled items as non-clickable spans
                  if (item.isTesting) {
                    return (
                      <span
                        key={item.href}
                        className="pill-neon w-full text-left px-4 py-3 font-medium border transition-all duration-300 ease-out flex flex-col cursor-not-allowed opacity-50 text-akari-muted/40 border-akari-muted/20 bg-akari-muted/5"
                      >
                        <span>{item.label}</span>
                        <span className="text-[8px] text-amber-500/70 font-normal leading-tight mt-0.5">coming soon</span>
                      </span>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMobileNavOpen(false)}
                      className={`pill-neon w-full text-left px-4 py-3 font-medium border transition-all duration-300 ease-out flex flex-col ${
                        active
                          ? 'text-black bg-gradient-neon-teal border-akari-neon-teal/50 shadow-neon-teal'
                          : 'text-akari-muted border-akari-neon-teal/30 hover:text-akari-neon-teal hover:border-akari-neon-teal/60 hover:bg-akari-neon-teal/5 hover:shadow-[0_0_12px_rgba(0,246,162,0.2)]'
                      }`}
                    >
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              {/* Divider */}
              <div className="border-t border-akari-neon-teal/20 my-4" />

              {/* Tier Badge - only show when logged in */}
              {isLoggedIn && (
                <div className="pt-4 border-t border-akari-neon-teal/20">
                  <button
                    onClick={() => {
                      setIsMobileNavOpen(false);
                      if (currentTier === 'seer') {
                        setUpgradeModalState({ open: true, targetTier: 'analyst' });
                      } else if (currentTier === 'analyst') {
                        setUpgradeModalState({ open: true, targetTier: 'institutional_plus' });
                      } else {
                        router.push('/portal/pricing');
                      }
                    }}
                    className={`pill-neon w-full flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-medium border border-akari-neon-teal/40 transition-all duration-300 ease-out ${tierInfo.bgColor} ${tierInfo.color} hover:border-akari-neon-teal/60 hover:shadow-[0_0_12px_rgba(0,246,162,0.3)]`}
                    title={`Your current tier: ${tierInfo.name}`}
                  >
                    <span>Level:</span>
                    {currentTier === 'seer' ? `${tierInfo.name} · Upgrade` : 
                     currentTier === 'analyst' ? `${tierInfo.name} · Manage` : 
                     tierInfo.name}
                  </button>
                </div>
              )}

              {/* User Menu - only show when logged in */}
              {isLoggedIn && (
                <div className="pt-4 border-t border-akari-neon-teal/20">
                  <div className="text-xs text-akari-muted mb-2">Account</div>
                  <UserMenu />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Page content */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6 pb-16 pt-6 sm:pt-8">
        {children}
      </main>

      {/* Upgrade Modal */}
      {isLoggedIn && (
        <UpgradeModal
          isOpen={upgradeModalState.open}
          onClose={() => setUpgradeModalState({ open: false })}
          user={akariUser.user}
          targetTier={upgradeModalState.targetTier}
        />
      )}

      {/* Analyst Social Boost Promo Modal */}
      {isLoggedIn && promo.isEligible && (
        <AnalystPromoModal
          open={promo.isOpen}
          onOpenChange={promo.closeModal}
          status={promo.status}
          onAccept={promo.accept}
          onSkip={promo.skip}
          onNever={promo.never}
          onVerify={promo.verify}
          isDeciding={promo.isDeciding}
          isVerifying={promo.isVerifying}
          verifyError={promo.verifyError}
          grantedUntil={promo.grantedUntil}
        />
      )}
    </div>
    </>
  );
}

