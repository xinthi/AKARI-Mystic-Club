import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Logo } from '../Logo';
import { useAkariUser } from '@/lib/akari-auth';
import { getUserTierInfo, getUserTier } from '@/lib/userTier';
import { UpgradeModal } from './UpgradeModal';
import { UserMenu } from './UserMenu';

type Props = {
  title?: string;
  children: React.ReactNode;
};

const navItems = [
  { href: '/portal', label: 'Home' },
  { href: '/portal/markets', label: 'Markets' },
  { href: '/portal/memes', label: 'Meme Radar' },
  { href: '/portal/sentiment', label: 'Sentiment' },
  { href: '/portal/new-launches', label: 'New Launches' },
  { href: '/portal/pricing', label: 'Pricing' },
];

export function PortalLayout({ title = 'Akari Mystic Club', children }: Props) {
  const router = useRouter();
  const akariUser = useAkariUser();
  const { isLoggedIn } = akariUser;
  const tierInfo = getUserTierInfo(akariUser.user);
  const currentTier = getUserTier(akariUser.user);
  const [upgradeModalState, setUpgradeModalState] = useState<{ open: boolean; targetTier?: 'analyst' | 'institutional_plus' }>({
    open: false,
  });

  return (
    <>
      <Head>
        <title>{title} – Akari Mystic Club</title>
      </Head>
      <div className="min-h-screen bg-akari-bg text-akari-text">
      {/* Top nav */}
      <header className="border-b border-akari-border/70 bg-black/50 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 px-4 py-3">
          {/* Logo + brand */}
          <Link href="/portal" className="flex items-center gap-2">
            <Logo size={28} />
            <div className="flex flex-col">
              <span className="text-[11px] tracking-[0.18em] uppercase text-akari-muted">
                Akari Mystic Club
              </span>
              <span className="text-xs text-akari-muted/70 hidden sm:block">
                Prediction-native market intelligence
              </span>
            </div>
          </Link>

          {/* Nav links */}
          <nav className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-akari-muted w-full sm:w-auto">
            {navItems.map((item) => {
              const active =
                router.pathname === item.href ||
                (item.href !== '/portal' && router.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`transition hover:text-akari-primary whitespace-nowrap ${
                    active
                      ? 'text-akari-primary'
                      : 'text-akari-muted'
                  }`}
                >
                  {item.label}
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
                className={`transition hover:opacity-80 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border whitespace-nowrap ${tierInfo.bgColor} ${tierInfo.color}`}
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

            <a
              href="https://t.me/AKARIMystic_Bot?start=ref_AKARI_649318_XJO7"
              className="ml-auto sm:ml-0 rounded-full bg-akari-primary px-3 py-1.5 text-[11px] font-medium text-black shadow-akari-glow hover:opacity-90 transition whitespace-nowrap"
            >
              Open MiniApp
            </a>
          </nav>
        </div>
      </header>

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
    </div>
    </>
  );
}

