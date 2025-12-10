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
      <section className="grid items-center gap-12 md:grid-cols-[1.3fr_minmax(0,1fr)] mb-16">
        {/* Left copy */}
        <div>
          <p className="mb-4 text-xs uppercase tracking-[0.25em] text-akari-muted">
            Community driven market intelligence
          </p>

          <h1 className="mb-6 text-4xl font-bold leading-tight md:text-5xl">
            One hub for{' '}
            <span className="text-gradient-teal">Markets</span>,{' '}
            <span className="text-gradient-blue">Memecoins</span> and{' '}
            <span className="text-gradient-pink">Launchpads</span>.
          </h1>

          <p className="mb-8 max-w-xl text-base text-akari-muted leading-relaxed">
            Akari Mystic Club collects live crypto data from exchanges, chains and launchpads, then turns it into simple dashboards the community can explore, rank and share. When you want to act on a view, you jump into the Mystic Club MiniApp.
          </p>

          {/* CTAs */}
          <div className="mb-8 flex flex-wrap gap-4">
            <a
              href="https://play.akarimystic.club"
              className="pill-neon inline-flex items-center gap-2 bg-gradient-neon-teal px-6 py-3 text-sm font-semibold text-black shadow-neon-teal hover:shadow-akari-glow transition-all duration-300"
            >
              🚀 Launch MiniApp
            </a>
            <a
              href="#markets"
              className="pill-neon inline-flex items-center gap-2 border border-akari-neon-teal/40 px-6 py-3 text-sm font-medium text-akari-muted transition-all duration-300 hover:border-akari-neon-teal/60 hover:text-akari-neon-teal hover:bg-akari-neon-teal/5 hover:shadow-[0_0_12px_rgba(0,246,162,0.2)]"
            >
              📊 Explore Markets
            </a>
          </div>

          {/* Pills */}
          <div className="flex flex-wrap gap-3 text-xs text-akari-muted">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-akari-cardSoft/50 border border-akari-neon-teal/20 px-3 py-1.5">
              ✅ Powered by Binance, CoinGecko, DexScreener
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-akari-cardSoft/50 border border-akari-neon-teal/20 px-3 py-1.5">
              🔮 Auto-created &amp; auto-resolved markets
            </span>
          </div>
        </div>

        {/* Right highlight card */}
        <div className="neon-card neon-hover p-6">
          <p className="mb-4 text-xs uppercase tracking-wider text-akari-muted font-semibold">Live samplers</p>
          <div className="space-y-4 text-xs">
            {/* Markets card */}
            <div className="neon-card neon-hover p-4 border border-akari-neon-teal/20">
              <div className="mb-2 flex items-center justify-between">
                <span className="pill-neon rounded-full bg-akari-neon-teal/15 border border-akari-neon-teal/30 px-3 py-1 text-[10px] uppercase tracking-[0.16em] font-semibold text-akari-neon-teal">
                  Markets
                </span>
                <span className="text-[10px] text-akari-muted">
                  Top gainers 24h
                </span>
              </div>
              <p className="text-sm font-medium text-akari-text mb-1">Will SOL stay above $130?</p>
              <p className="text-[11px] text-akari-muted">
                Auto synced from Binance and CoinGecko.
              </p>
            </div>

            {/* Meme Radar */}
            <div className="neon-card neon-hover p-4 border border-akari-neon-blue/20">
              <div className="mb-2 flex items-center justify-between">
                <span className="pill-neon rounded-full bg-akari-neon-blue/15 border border-akari-neon-blue/30 px-3 py-1 text-[10px] uppercase tracking-[0.16em] font-semibold text-akari-neon-blue">
                  Meme Radar
                </span>
                <span className="text-[10px] text-akari-muted">
                  Onchain degens
                </span>
              </div>
              <p className="text-sm font-medium text-akari-text mb-1">New SOL memes with 50k+ liquidity.</p>
              <p className="text-[11px] text-akari-muted">
                Curated from DexScreener, surfaced for the Akari community.
              </p>
            </div>

            {/* Launchpads */}
            <div className="neon-card neon-hover p-4 border border-akari-neon-pink/20">
              <div className="mb-2 flex items-center justify-between">
                <span className="pill-neon rounded-full bg-akari-neon-pink/15 border border-akari-neon-pink/30 px-3 py-1 text-[10px] uppercase tracking-[0.16em] font-semibold text-akari-neon-pink">
                  Launchpads
                </span>
                <span className="text-[10px] text-akari-muted">ROI tracker</span>
              </div>
              <p className="text-sm font-medium text-akari-text mb-1">
                {platformNames.length > 60 
                  ? `${platformNames.substring(0, 60)}...`
                  : platformNames || 'Multiple launchpads'}.
              </p>
              <p className="text-[11px] text-akari-muted">
                Compare sale price with current price and follow the next wave of launches.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section
        id="markets"
        className="grid gap-6 text-xs md:grid-cols-2 lg:grid-cols-4"
      >
        <Link
          href="/portal/markets"
          className="neon-card neon-hover p-6 group"
        >
          <p className="mb-2 text-xs uppercase tracking-[0.2em] font-semibold text-gradient-teal">
            Markets
          </p>
          <p className="mb-2 text-base font-semibold text-akari-text group-hover:text-gradient-teal transition-all duration-300">Centralized &amp; onchain overview.</p>
          <p className="text-sm text-akari-muted leading-relaxed">
            Top gainers, volume leaders and narratives, all aggregated into Akari so the community can see the bigger picture.
          </p>
        </Link>

        <Link
          id="memes"
          href="/portal/memes"
          className="neon-card neon-hover p-6 group"
        >
          <p className="mb-2 text-xs uppercase tracking-[0.2em] font-semibold text-gradient-blue">
            Meme Radar
          </p>
          <p className="mb-2 text-base font-semibold text-akari-text group-hover:text-gradient-blue transition-all duration-300">Where the real degen flow is.</p>
          <p className="text-sm text-akari-muted leading-relaxed">
            Track new pairs, liquidity and velocity, then turn the best ideas into calls inside the MiniApp.
          </p>
        </Link>

        <Link
          href="/portal/sentiment"
          className="neon-card neon-hover p-6 group"
        >
          <p className="mb-2 text-xs uppercase tracking-[0.2em] font-semibold text-gradient-pink">
            Sentiment Terminal
          </p>
          <p className="mb-2 text-base font-semibold text-akari-text group-hover:text-gradient-pink transition-all duration-300">Track CT sentiment in real-time.</p>
          <p className="text-sm text-akari-muted leading-relaxed">
            Monitor social sentiment, engagement heat, and AKARI credibility scores for tracked projects.
          </p>
        </Link>

        <Link
          id="launchpads"
          href="/portal/new-launches"
          className="neon-card neon-hover p-6 group"
        >
          <p className="mb-2 text-xs uppercase tracking-[0.2em] font-semibold text-gradient-neon-teal">
            Launchpads
          </p>
          <p className="mb-2 text-base font-semibold text-akari-text group-hover:text-gradient-neon transition-all duration-300">
            {platformNames.length > 60 
              ? `${platformNames.substring(0, 60)}...`
              : platformNames || 'Multiple launchpads'}.
          </p>
          <p className="text-sm text-akari-muted leading-relaxed">
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
