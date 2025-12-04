import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Logo } from '../Logo';

type Props = {
  title?: string;
  children: React.ReactNode;
};

const navItems = [
  { href: '/portal', label: 'Home' },
  { href: '/portal/markets', label: 'Markets' },
  { href: '/portal/memes', label: 'Meme Radar' },
  { href: '/portal/new-launches', label: 'New Launches' },
];

export function PortalLayout({ title = 'Akari Mystic Club', children }: Props) {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>{title} – Akari Mystic Club</title>
      </Head>
      <div className="min-h-screen bg-akari-bg text-akari-text">
      {/* Top nav */}
      <header className="border-b border-akari-border/70 bg-black/50 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          {/* Logo + brand */}
          <Link href="/portal" className="flex items-center gap-2">
            <Logo size={28} />
            <div className="flex flex-col">
              <span className="text-[11px] tracking-[0.18em] uppercase text-akari-muted">
                Akari Mystic Club
              </span>
              <span className="text-xs text-akari-muted/70">
                Prediction-native market intelligence
              </span>
            </div>
          </Link>

          {/* Nav links */}
          <nav className="flex items-center gap-4 text-xs text-akari-muted">
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

            <a
              href="https://play.akarimystic.club"
              className="ml-1 rounded-full bg-akari-primary px-3 py-1.5 text-[11px] font-medium text-black shadow-akari-glow hover:opacity-90 transition"
            >
              Open MiniApp
            </a>
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        {children}
      </main>
    </div>
    </>
  );
}

