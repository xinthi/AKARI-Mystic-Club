import React from 'react';
import { GetServerSideProps } from 'next';
import { PortalLayout } from '../../components/portal/PortalLayout';
import { getTopPumpFunMemecoins, type MemeCoin } from '../../services/memecoinRadar';

interface MemesPageProps {
  memecoins: MemeCoin[];
  error?: string;
}

function formatPrice(price: number): string {
  if (price >= 1) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  } else {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    }).format(price);
  }
}

function formatMarketCap(marketCap: number | null): string {
  if (marketCap === null) return 'N/A';
  
  if (marketCap >= 1_000_000_000) {
    return `$${(marketCap / 1_000_000_000).toFixed(2)}B`;
  } else if (marketCap >= 1_000_000) {
    return `$${(marketCap / 1_000_000).toFixed(2)}M`;
  } else if (marketCap >= 1_000) {
    return `$${(marketCap / 1_000).toFixed(2)}K`;
  }
  return formatPrice(marketCap);
}

function formatPriceChange(change: number | null): { text: string; color: string } {
  if (change === null) {
    return { text: 'N/A', color: 'text-akari-muted' };
  }
  
  const sign = change >= 0 ? '+' : '';
  const color = change >= 0 ? 'text-green-400' : 'text-red-400';
  return {
    text: `${sign}${change.toFixed(2)}%`,
    color,
  };
}

export default function MemesPage({ memecoins, error }: MemesPageProps) {
  // Sort by marketCapUsd descending (highest first), then by priceUsd if marketCap is null
  const sortedMemecoins = [...memecoins].sort((a, b) => {
    if (a.marketCapUsd !== null && b.marketCapUsd !== null) {
      return b.marketCapUsd - a.marketCapUsd;
    }
    if (a.marketCapUsd !== null) return -1;
    if (b.marketCapUsd !== null) return 1;
    return b.priceUsd - a.priceUsd;
  });

  return (
    <PortalLayout title="Meme Radar">
      <section className="mb-6">
        <h1 className="text-2xl font-semibold mb-2 text-akari-text">Meme Radar</h1>
        <p className="text-sm text-akari-muted max-w-2xl">
          Track onchain meme pairs, liquidity and velocity. Surface the hottest degens and turn them into prediction markets in the MiniApp.
        </p>
      </section>

      {/* Error State */}
      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 mb-6">
          <p className="text-sm text-red-400">
            Could not load meme radar right now. Please try again in a moment.
          </p>
        </div>
      )}

      {/* Meme Radar Grid */}
      {!error && sortedMemecoins.length > 0 && (
        <div className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-akari-text">Pump.fun Radar</h2>
            <span className="text-xs text-akari-muted">High attention zone</span>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sortedMemecoins.map((coin) => {
              const priceChange = formatPriceChange(coin.priceChange24h);
              
              return (
                <div
                  key={coin.id}
                  className="rounded-2xl border border-akari-accent/20 bg-akari-card p-4 hover:border-akari-primary/40 hover:shadow-akari-glow transition"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-akari-text mb-0.5">{coin.name}</h3>
                      <p className="text-xs text-akari-muted uppercase">{coin.symbol}</p>
                    </div>
                    {coin.marketCapUsd !== null && coin.marketCapUsd > 10_000_000 && (
                      <span className="inline-flex items-center rounded-full bg-akari-primary/15 px-2 py-1 text-[10px] font-medium text-akari-primary uppercase tracking-[0.1em]">
                        High Attention
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-akari-muted">Price</span>
                      <span className="text-sm font-semibold text-akari-primary">{formatPrice(coin.priceUsd)}</span>
                    </div>
                    
                    {coin.marketCapUsd !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-akari-muted">Market Cap</span>
                        <span className="text-xs font-medium text-akari-text">{formatMarketCap(coin.marketCapUsd)}</span>
                      </div>
                    )}
                    
                    {coin.priceChange24h !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-akari-muted">24h Change</span>
                        <span className={`text-xs font-medium ${priceChange.color}`}>{priceChange.text}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!error && sortedMemecoins.length === 0 && (
        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-6 mb-6">
          <p className="text-sm text-akari-muted text-center">
            No meme coins available at this time.
          </p>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-4 hover:border-akari-primary/40 transition">
          <p className="text-xs text-akari-primary mb-1 uppercase tracking-[0.1em]">SOL memecoins tracker</p>
          <p className="text-sm mb-1 text-akari-text font-medium">Solana Memes</p>
          <p className="text-[11px] text-akari-muted">
            Track SOL memes from DexScreener. Filter by liquidity threshold, age, holder count, and velocity. Auto-create prediction pools.
          </p>
        </div>

        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-4 hover:border-akari-primary/40 transition">
          <p className="text-xs text-akari-accent mb-1 uppercase tracking-[0.1em]">AI memes vs pure degen</p>
          <p className="text-sm mb-1 text-akari-text font-medium">Narrative Separation</p>
          <p className="text-[11px] text-akari-muted">
            Separate memes by narrative. AI-powered memes vs pure degen plays. Track which narrative performs better.
          </p>
        </div>

        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-4 hover:border-akari-primary/40 transition">
          <p className="text-xs text-akari-profit mb-1 uppercase tracking-[0.1em]">Watchlist / candidates</p>
          <p className="text-sm mb-1 text-akari-text font-medium">Prediction Candidates</p>
          <p className="text-[11px] text-akari-muted">
            Curated list of meme pairs that meet our criteria. These candidates can become new prediction pools with one tap.
          </p>
        </div>
      </div>
    </PortalLayout>
  );
}

export const getServerSideProps: GetServerSideProps<MemesPageProps> = async () => {
  try {
    const memecoins = await getTopPumpFunMemecoins(12);
    
    return {
      props: {
        memecoins: JSON.parse(JSON.stringify(memecoins)),
      },
    };
  } catch (error) {
    console.error('[Memes Page] Error fetching memecoins:', error);
    return {
      props: {
        memecoins: [],
        error: 'Failed to load meme radar',
      },
    };
  }
};
