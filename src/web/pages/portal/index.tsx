import React from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { PortalLayout } from '../../components/portal/PortalLayout';
import { prisma } from '@/lib/prisma';

interface PortalHomeProps {
  platforms: Array<{ id: string; name: string }>;
}

export default function PortalHome({ platforms }: PortalHomeProps) {
  // Format platform names for display
  const platformNames = platforms.length > 0
    ? platforms.map(p => p.name).join(', ')
    : 'Multiple launchpads';
  return (
    <PortalLayout title="Home">
      {/* Hero grid */}
      <section className="grid items-center gap-8 md:grid-cols-[1.3fr_minmax(0,1fr)]">
        {/* Left copy */}
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.25em] text-akari-muted">
            Community driven market intelligence
          </p>

          <h1 className="mb-3 text-3xl font-semibold leading-tight md:text-4xl">
            One hub for{' '}
            <span className="text-akari-primary">Markets</span>,{' '}
            <span className="text-akari-accent">Memecoins</span> and{' '}
            <span className="text-akari-profit">Launchpads</span>.
          </h1>

          <p className="mb-6 max-w-xl text-sm text-akari-muted">
            Akari Mystic Club collects live crypto data from exchanges, chains and launchpads, then turns it into simple dashboards the community can explore, rank and share. When you want to act on a view, you jump into the Mystic Club MiniApp.
          </p>

          {/* CTAs */}
          <div className="mb-6 flex flex-wrap gap-3">
            <a
              href="https://play.akarimystic.club"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-akari-primary to-akari-accent px-4 py-2 text-xs font-medium text-neutral-900 shadow-akari-glow transition hover:scale-[0.99] active:scale-95"
            >
              🚀 Launch MiniApp
            </a>
            <a
              href="#markets"
              className="inline-flex items-center gap-2 rounded-full border border-akari-accent/40 px-4 py-2 text-xs text-akari-muted transition hover:border-akari-primary hover:text-akari-primary"
            >
              📊 Explore Markets
            </a>
          </div>

          {/* Pills */}
          <div className="flex flex-wrap gap-3 text-[11px] text-akari-muted">
            <span className="inline-flex items-center gap-1 rounded-full bg-akari-cardSoft px-2 py-1">
              ✅ Powered by Binance, CoinGecko, DexScreener
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-akari-cardSoft px-2 py-1">
              🔮 Auto-created &amp; auto-resolved markets
            </span>
          </div>
        </div>

        {/* Right highlight card */}
        <div className="rounded-3xl border border-akari-accent/30 bg-akari-card p-4 shadow-akari-glow">
          <p className="mb-2 text-xs text-akari-muted">Live samplers</p>
          <div className="space-y-3 text-xs">
            {/* Markets card */}
            <div className="rounded-2xl border border-akari-primary/30 bg-akari-cardSoft p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="rounded-full bg-akari-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-akari-primary">
                  Markets
                </span>
                <span className="text-[10px] text-akari-muted">
                  Top gainers 24h
                </span>
              </div>
              <p className="text-sm">Will SOL stay above $130?</p>
              <p className="mt-1 text-[11px] text-akari-muted">
                Auto synced from Binance and CoinGecko.
              </p>
            </div>

            {/* Meme Radar */}
            <div className="rounded-2xl border border-akari-accent/30 bg-akari-cardSoft p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="rounded-full bg-akari-accent/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-akari-accent">
                  Meme Radar
                </span>
                <span className="text-[10px] text-akari-muted">
                  Onchain degens
                </span>
              </div>
              <p className="text-sm">New SOL memes with 50k+ liquidity.</p>
              <p className="mt-1 text-[11px] text-akari-muted">
                Curated from DexScreener, surfaced for the Akari community.
              </p>
            </div>

            {/* Launchpads */}
            <div className="rounded-2xl border border-akari-profit/40 bg-akari-cardSoft p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="rounded-full bg-akari-profit/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-akari-profit">
                  Launchpads
                </span>
                <span className="text-[10px] text-akari-muted">ROI tracker</span>
              </div>
              <p className="text-sm">
                {platformNames.length > 60 
                  ? `${platformNames.substring(0, 60)}...`
                  : platformNames || 'Multiple launchpads'}.
              </p>
              <p className="mt-1 text-[11px] text-akari-muted">
                Compare sale price with current price and follow the next wave of launches.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section
        id="markets"
        className="mt-10 grid gap-4 text-xs md:grid-cols-3"
      >
        <Link
          href="/portal/markets"
          className="rounded-2xl border border-akari-accent/30 bg-akari-card p-4 shadow-akari-soft transition hover:border-akari-primary/70"
        >
          <p className="mb-1 text-[11px] uppercase tracking-[0.2em] text-akari-primary">
            Markets
          </p>
          <p className="mb-1 text-sm">Centralized &amp; onchain overview.</p>
          <p className="text-[11px] text-akari-muted">
            Top gainers, volume leaders and narratives, all aggregated into Akari so the community can see the bigger picture.
          </p>
        </Link>

        <Link
          id="memes"
          href="/portal/memes"
          className="rounded-2xl border border-akari-accent/30 bg-akari-card p-4 transition hover:border-akari-primary/70"
        >
          <p className="mb-1 text-[11px] uppercase tracking-[0.2em] text-akari-accent">
            Meme Radar
          </p>
          <p className="mb-1 text-sm">Where the real degen flow is.</p>
          <p className="text-[11px] text-akari-muted">
            Track new pairs, liquidity and velocity, then turn the best ideas into calls inside the MiniApp.
          </p>
        </Link>

        <Link
          id="launchpads"
          href="/portal/new-launches"
          className="rounded-2xl border border-akari-accent/30 bg-akari-card p-4 transition hover:border-akari-primary/70"
        >
          <p className="mb-1 text-[11px] uppercase tracking-[0.2em] text-akari-profit">
            Launchpads
          </p>
          <p className="mb-1 text-sm">
            {platformNames.length > 60 
              ? `${platformNames.substring(0, 60)}...`
              : platformNames || 'Multiple launchpads'}.
          </p>
          <p className="text-[11px] text-akari-muted">
            Compare sale price vs live price, rank platforms by ROI, and
            speculate which IDO list will outperform next.
          </p>
        </Link>
      </section>
    </PortalLayout>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  try {
    const platforms = await prisma.launchPlatform.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 10, // Limit to top 10 for display
    });

    return {
      props: {
        platforms: JSON.parse(JSON.stringify(platforms)),
      },
    };
  } catch (error) {
    console.error('[Portal Home] Error fetching platforms:', error);
    return {
      props: {
        platforms: [],
      },
    };
  }
};
