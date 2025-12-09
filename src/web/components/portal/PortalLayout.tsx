import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Logo } from '../Logo';
import { useAkariUser } from '@/lib/akari-auth';

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
];

export function PortalLayout({ title = 'Akari Mystic Club', children }: Props) {
  const router = useRouter();
  const { isLoggedIn, xUsername } = useAkariUser();

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
          <nav className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-akari-muted w-full sm:w-auto">
            {navItems.map((item) => {
              const active =
                router.pathname === item.href ||
                (item.href !== '/portal' && router.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`transition hover:text-akari-primary ${
                    active
                      ? 'text-akari-primary'
                      : 'text-akari-muted'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {/* My Profile link - only show when logged in */}
            {isLoggedIn && (
              <Link
                href="/portal/me"
                className={`transition hover:text-akari-primary flex items-center gap-1 ${
                  router.pathname === '/portal/me'
                    ? 'text-akari-primary'
                    : 'text-akari-muted'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                </svg>
                {xUsername ? `@${xUsername}` : 'Profile'}
              </Link>
            )}

            <a
              href="https://t.me/AKARIMystic_Bot?start=ref_AKARI_649318_XJO7"
              className="ml-auto sm:ml-1 rounded-full bg-akari-primary px-3 py-1.5 text-[11px] font-medium text-black shadow-akari-glow hover:opacity-90 transition whitespace-nowrap"
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
    </div>
    </>
  );
}

