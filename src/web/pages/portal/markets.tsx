import React from 'react';
import { GetServerSideProps } from 'next';
import { PortalLayout } from '../../components/portal/PortalLayout';
import {
  getMarketPulse,
  getAkariHighlights,
  getTrendingMarketTable,
  type MarketPulse,
  type AkariHighlights,
} from '../../services/akariMarkets';
import type { TrendingCoinWithPrice } from '../../services/coingecko';
import { getRecentWhaleEntries } from '../../lib/portal/db';

interface MarketsPageProps {
  pulse: MarketPulse | null;
  highlights: AkariHighlights | null;
  trending: TrendingCoinWithPrice[];
  whaleEntries: Array<{
    id: string;
    tokenSymbol: string;
    chain: string;
    wallet: string;
    amountUsd: number;
    occurredAt: string | Date;
  }>;
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

function formatLargeNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `$${(num / 1_000_000_000).toFixed(2)}B`;
  } else if (num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(2)}M`;
  } else if (num >= 1_000) {
    return `$${(num / 1_000).toFixed(2)}K`;
  }
  return formatPrice(num);
}

function formatVolumeOrMarketCap(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return formatLargeNumber(value);
}

function formatPriceChange(change: number | null | undefined): { text: string; color: string } {
  if (change === null || change === undefined) {
    return { text: 'N/A', color: 'text-akari-muted' };
  }
  
  const sign = change >= 0 ? '+' : '';
  const color = change >= 0 ? 'text-green-400' : 'text-red-400';
  return {
    text: `${sign}${change.toFixed(2)}%`,
    color,
  };
}

function formatROI(roi: number | null | undefined): string {
  if (roi === null || roi === undefined) {
    return 'N/A';
  }
  const sign = roi >= 0 ? '+' : '';
  return `${sign}${roi.toFixed(2)}%`;
}

function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

export default function MarketsPage({ pulse, highlights, trending, whaleEntries, error }: MarketsPageProps) {
  return (
    <PortalLayout title="Markets overview">
      <section className="mb-6">
        <h1 className="text-2xl font-semibold mb-2 text-akari-text">Markets overview</h1>
        <p className="text-sm text-akari-muted max-w-2xl">
          High level view of top gainers, volume leaders and narratives. We group markets into segments like Layer 1, Layer 2, AI, GameFi, InfoFi and SportFi so it is easier to see what is actually moving.
        </p>
      </section>

      {/* Error State */}
      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 mb-6">
          <p className="text-sm text-red-400">
            Could not load market data right now. Please try again in a moment.
          </p>
        </div>
      )}

      {/* Market Pulse */}
      {!error && pulse && (
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-akari-primary/30 bg-akari-card p-4">
            <p className="text-xs text-akari-primary mb-1 uppercase tracking-[0.1em]">Tracked Market Cap</p>
            <p className="text-lg font-semibold text-akari-text">
              {pulse.trackedMarketCapUsd > 0 ? formatLargeNumber(pulse.trackedMarketCapUsd) : 'N/A'}
            </p>
          </div>
          <div className="rounded-2xl border border-akari-accent/30 bg-akari-card p-4">
            <p className="text-xs text-akari-accent mb-1 uppercase tracking-[0.1em]">Tracked 24h Volume</p>
            <p className="text-lg font-semibold text-akari-text">
              {pulse.trackedVolume24hUsd > 0 ? formatLargeNumber(pulse.trackedVolume24hUsd) : 'N/A'}
            </p>
          </div>
          <div className="rounded-2xl border border-akari-profit/30 bg-akari-card p-4">
            <p className="text-xs text-akari-profit mb-1 uppercase tracking-[0.1em]">Data Sources</p>
            <p className="text-lg font-semibold text-akari-text">
              {pulse.sources.join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Smart Money Heatmap */}
      {!error && whaleEntries.length > 0 && (
        <div className="mb-6 rounded-2xl border border-akari-accent/20 bg-akari-card p-6">
          <h3 className="text-sm font-semibold text-akari-text mb-1">Smart Money Heatmap</h3>
          <p className="text-xs text-akari-muted mb-4">
            Latest large entries from tracked wallets.
          </p>
          
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {whaleEntries.slice(0, 9).map((entry) => {
              // Determine intensity based on amount
              let intensityClass = 'text-akari-muted';
              if (entry.amountUsd >= 100000) {
                intensityClass = 'text-green-400 font-semibold';
              } else if (entry.amountUsd >= 25000) {
                intensityClass = 'text-green-300';
              } else {
                intensityClass = 'text-akari-text';
              }

              return (
                <div
                  key={entry.id}
                  className="rounded-xl border border-akari-border/30 bg-akari-cardSoft p-3 hover:border-akari-primary/40 transition"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-bold text-akari-primary">
                          {entry.tokenSymbol}
                        </span>
                        <span className="text-[10px] text-akari-muted uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-akari-border/30">
                          {entry.chain}
                        </span>
                      </div>
                      <p className={`text-sm ${intensityClass}`}>
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD',
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        }).format(entry.amountUsd)}
                      </p>
                    </div>
                  </div>
                  <p className="text-[10px] text-akari-muted">
                    {formatRelativeTime(entry.occurredAt)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Highlights Row */}
      {!error && highlights && (
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          {/* Trending */}
          <div className="rounded-2xl border border-akari-primary/30 bg-akari-card p-4">
            <h3 className="text-sm font-semibold text-akari-text mb-1">Trending</h3>
            <p className="text-xs text-akari-muted mb-3">
              Top trending coins by attention.
            </p>
            {highlights.trending.length > 0 ? (
              <div className="space-y-2">
                {highlights.trending.map((coin) => (
                  <div key={coin.id} className="flex items-center justify-between text-xs">
                    <span className="text-akari-text">{coin.name}</span>
                    <span className="text-akari-primary font-medium">{formatPrice(coin.priceUsd)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-akari-muted">No trending data available</p>
            )}
          </div>

          {/* Meme Radar */}
          <div className="rounded-2xl border border-akari-accent/30 bg-akari-card p-4">
            <h3 className="text-sm font-semibold text-akari-text mb-1">Meme Radar</h3>
            <p className="text-xs text-akari-muted mb-3">
              Pump.fun and friends, ranked by daily moves.
            </p>
            {highlights.topMemes.length > 0 ? (
              <div className="space-y-2">
                {highlights.topMemes.map((meme) => {
                  const change = formatPriceChange(meme.change24h);
                  return (
                    <div key={meme.id} className="flex items-center justify-between text-xs">
                      <span className="text-akari-text uppercase">{meme.symbol}</span>
                      <span className={`font-medium ${change.color}`}>{change.text}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-akari-muted">No meme data available</p>
            )}
          </div>

          {/* Launchpad Winners */}
          <div className="rounded-2xl border border-akari-profit/30 bg-akari-card p-4">
            <h3 className="text-sm font-semibold text-akari-text mb-1">Launchpad Winners</h3>
            <p className="text-xs text-akari-muted mb-3">
              Best ROI from the launches Akari tracks.
            </p>
            {highlights.topLaunches.length > 0 ? (
              <div className="space-y-2">
                {highlights.topLaunches.map((launch) => (
                  <div key={launch.id} className="flex items-center justify-between text-xs">
                    <span className="text-akari-text">
                      {launch.tokenSymbol}
                      {launch.platformName && ` · ${launch.platformName}`}
                    </span>
                    <span className="text-akari-profit font-medium">
                      {formatROI(launch.roiPercent)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-akari-muted">No launch data available</p>
            )}
          </div>
        </div>
      )}

      {/* Trending Markets Table */}
      {!error && trending.length > 0 && (
        <div className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-akari-text">Trending Markets</h2>
            <span className="text-xs text-akari-muted">Data source: CoinGecko</span>
          </div>
          
          {/* Desktop Table */}
          <div className="hidden md:block rounded-2xl border border-akari-accent/20 bg-akari-card overflow-hidden">
            <table className="w-full">
              <thead className="bg-akari-cardSoft border-b border-akari-border/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-akari-muted uppercase tracking-[0.1em]">Name</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-akari-muted uppercase tracking-[0.1em]">Price</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-akari-muted uppercase tracking-[0.1em]">Volume 24H</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-akari-muted uppercase tracking-[0.1em]">Market Cap</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-akari-muted uppercase tracking-[0.1em]">Status</th>
                </tr>
              </thead>
              <tbody>
                {trending.map((coin, index) => (
                  <tr
                    key={coin.id}
                    className="border-b border-akari-border/30 last:border-0 hover:bg-akari-cardSoft/50 transition"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {coin.imageUrl ? (
                          <img
                            src={coin.imageUrl}
                            alt={coin.name}
                            className="w-8 h-8 rounded-full flex-shrink-0"
                            onError={(e) => {
                              // Fallback to placeholder if image fails to load
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const fallback = target.nextElementSibling as HTMLElement;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-akari-primary/20 text-akari-primary text-xs font-semibold ${coin.imageUrl ? 'hidden' : ''}`}
                        >
                          {(coin.symbol || coin.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-akari-text">{coin.name}</span>
                          <span className="text-xs text-akari-muted uppercase">{coin.symbol}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-akari-primary">{formatPrice(coin.priceUsd)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-akari-text">{formatVolumeOrMarketCap(coin.volume24hUsd)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-akari-text">{formatVolumeOrMarketCap(coin.marketCapUsd)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {index < 3 ? (
                        <span className="inline-flex items-center rounded-full bg-akari-primary/15 px-2 py-1 text-[10px] font-medium text-akari-primary uppercase tracking-[0.1em]">
                          Top Attention
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-akari-accent/15 px-2 py-1 text-[10px] font-medium text-akari-accent uppercase tracking-[0.1em]">
                          Trending
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Grid */}
          <div className="md:hidden grid gap-3">
            {trending.map((coin, index) => (
              <div
                key={coin.id}
                className="rounded-2xl border border-akari-accent/20 bg-akari-card p-4 hover:border-akari-primary/40 transition"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {coin.imageUrl ? (
                      <img
                        src={coin.imageUrl}
                        alt={coin.name}
                        className="w-6 h-6 rounded-full flex-shrink-0"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const fallback = target.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-akari-primary/20 text-akari-primary text-[10px] font-semibold ${coin.imageUrl ? 'hidden' : ''}`}
                    >
                      {(coin.symbol || coin.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-akari-text">{coin.name}</h3>
                      <p className="text-xs text-akari-muted uppercase mt-0.5">{coin.symbol}</p>
                    </div>
                  </div>
                  {index < 3 ? (
                    <span className="inline-flex items-center rounded-full bg-akari-primary/15 px-2 py-1 text-[10px] font-medium text-akari-primary uppercase tracking-[0.1em]">
                      Top Attention
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-akari-accent/15 px-2 py-1 text-[10px] font-medium text-akari-accent uppercase tracking-[0.1em]">
                      Trending
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-akari-primary">{formatPrice(coin.priceUsd)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!error && trending.length === 0 && (
        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-6 mb-6">
          <p className="text-sm text-akari-muted text-center">
            No trending markets available at this time.
          </p>
        </div>
      )}

      {/* Narrative Tiles */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
        <div className="rounded-2xl border border-akari-border bg-akari-card p-4">
          <p className="text-xs text-akari-primary mb-1 uppercase tracking-[0.1em]">AI Markets</p>
          <p className="text-sm mb-1 text-akari-text">Artificial Intelligence</p>
          <p className="text-[11px] text-akari-muted">
            Track AI tokens and projects. Monitor price movements and create prediction markets.
          </p>
        </div>
        <div className="rounded-2xl border border-akari-border bg-akari-card p-4">
          <p className="text-xs text-akari-accent mb-1 uppercase tracking-[0.1em]">GameFi</p>
          <p className="text-sm mb-1 text-akari-text">Gaming & NFTs</p>
          <p className="text-[11px] text-akari-muted">
            Gaming tokens, NFT projects and metaverse assets. Follow trends and bet on outcomes.
          </p>
        </div>
        <div className="rounded-2xl border border-akari-border bg-akari-card p-4">
          <p className="text-xs text-akari-profit mb-1 uppercase tracking-[0.1em]">InfoFi</p>
          <p className="text-sm mb-1 text-akari-text">Information Finance</p>
          <p className="text-[11px] text-akari-muted">
            Oracle networks, data tokens and information markets. Predict data value and usage.
          </p>
        </div>
        <div className="rounded-2xl border border-akari-border bg-akari-card p-4">
          <p className="text-xs text-akari-primary mb-1 uppercase tracking-[0.1em]">DeFi & L2s</p>
          <p className="text-sm mb-1 text-akari-text">Decentralized Finance</p>
          <p className="text-[11px] text-akari-muted">
            DeFi protocols, Layer 2 solutions and scaling technologies. Track TVL and adoption.
          </p>
        </div>
        <div className="rounded-2xl border border-akari-border bg-akari-card p-4">
          <p className="text-xs text-akari-accent mb-1 uppercase tracking-[0.1em]">SportFi</p>
          <p className="text-sm mb-1 text-akari-text">Sports & Betting</p>
          <p className="text-[11px] text-akari-muted">
            Sports tokens, fan tokens and betting markets. Predict match outcomes and token performance.
          </p>
        </div>
        <div className="rounded-2xl border border-akari-border bg-akari-card p-4">
          <p className="text-xs text-akari-muted mb-1">Top Gainers 24h</p>
          <p className="text-sm mb-1 text-akari-text">Volume Leaders</p>
          <p className="text-[11px] text-akari-muted">
            Once wired, we will list coins like SOL, AVAX, LINK with 24h change and directly open prediction markets.
          </p>
        </div>
      </div>
    </PortalLayout>
  );
}

export const getServerSideProps: GetServerSideProps<MarketsPageProps> = async () => {
  try {
    const [pulse, highlights, trending, whaleEntries] = await Promise.all([
      getMarketPulse().catch(() => null),
      getAkariHighlights().catch(() => null),
      getTrendingMarketTable().catch(() => []),
      getRecentWhaleEntries(20).catch(() => []),
    ]);

    return {
      props: {
        pulse: pulse ? JSON.parse(JSON.stringify(pulse)) : null,
        highlights: highlights ? JSON.parse(JSON.stringify(highlights)) : null,
        trending: JSON.parse(JSON.stringify(trending)),
        whaleEntries: JSON.parse(JSON.stringify(whaleEntries)),
      },
    };
  } catch (error: any) {
    console.error('[Markets Page] Error fetching market data:', error);
    return {
      props: {
        pulse: null,
        highlights: null,
        trending: [],
        whaleEntries: [],
        error: 'Failed to load market data',
      },
    };
  }
};
