import React from 'react';
import { GetServerSideProps } from 'next';
import { PortalLayout } from '../../components/portal/PortalLayout';
import {
  getMarketPulse,
  getAkariHighlights,
  type MarketPulse,
  type AkariHighlights,
} from '../../services/akariMarkets';
import {
  getWhaleEntriesWithFallback,
  getLiquiditySignalsWithFallback,
  getLatestMarketSnapshots,
} from '../../lib/portal/db';
import type { MarketSnapshot } from '@prisma/client';
import { WhaleHeatmapCard, type WhaleEntryDto } from '../../components/portal/WhaleHeatmapCard';
import {
  getNarrativeSummaries,
  getVolumeLeaders,
  type NarrativeSummary,
  type VolumeLeader,
} from '../../services/akariNarratives';
import {
  LiquiditySignalsCard,
  type LiquiditySignalDto,
} from '../../components/portal/LiquiditySignalsCard';

// Serializable version of MarketSnapshot for SSR props
interface MarketSnapshotDto {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  change24hPct: number | null;
  source: string;
  createdAt: string;
}

interface MarketsPageProps {
  pulse: MarketPulse | null;
  highlights: AkariHighlights | null;
  trending: MarketSnapshotDto[];
  whaleEntriesRecent: WhaleEntryDto[];
  whaleLastAny: WhaleEntryDto | null;
  narratives: NarrativeSummary[];
  volumeLeaders: VolumeLeader[];
  liquiditySignalsRecent: LiquiditySignalDto[];
  liquidityLastAny: LiquiditySignalDto | null;
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

export default function MarketsPage({
  pulse,
  highlights,
  trending,
  whaleEntriesRecent,
  whaleLastAny,
  narratives,
  volumeLeaders,
  liquiditySignalsRecent,
  liquidityLastAny,
  error,
}: MarketsPageProps) {
  return (
    <PortalLayout title="Markets overview">
      <section className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold mb-2 text-akari-text">Markets overview</h1>
        <p className="text-xs sm:text-sm text-akari-muted max-w-2xl">
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
        <div className="mb-6 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
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
            <p className="text-sm font-semibold text-akari-text">
              These data tracked using multiple sources.
            </p>
          </div>
        </div>
      )}

      {/* Smart Money Heatmap & Liquidity Signals */}
      {!error && (
        <section className="mb-6 space-y-4 sm:space-y-6">
          <WhaleHeatmapCard
            recentEntries={whaleEntriesRecent}
            lastAnyEntry={whaleLastAny}
          />
          <LiquiditySignalsCard
            signals={liquiditySignalsRecent}
            lastAnySignal={liquidityLastAny}
          />
        </section>
      )}

      {/* Highlights Row */}
      {!error && highlights && (
        <div className="mb-6 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          {/* Trending */}
          <div className="rounded-2xl border border-akari-primary/30 bg-akari-card p-3 sm:p-4">
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
          <div className="rounded-2xl border border-akari-accent/30 bg-akari-card p-3 sm:p-4">
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
          <div className="rounded-2xl border border-akari-profit/30 bg-akari-card p-3 sm:p-4">
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

      {/* Trending Markets Table - Now from DB snapshots */}
      {!error && trending.length > 0 && (
        <div className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-akari-text">Trending Markets</h2>
            <span className="text-xs text-akari-muted">Data source: CoinGecko (cached)</span>
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
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-akari-primary/20 text-akari-primary text-xs font-semibold"
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
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-akari-primary/20 text-akari-primary text-[10px] font-semibold"
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

      {/* Empty State - when no snapshots */}
      {!error && trending.length === 0 && (
        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-6 mb-6">
          <p className="text-sm text-akari-muted text-center">
            Waiting for first market snapshot. Check back in a few minutes.
          </p>
        </div>
      )}

      {/* Narrative Tiles */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        {/* AI Markets */}
        {(() => {
          const narrative = narratives.find((n) => n.key === 'ai');
          return (
            <div className="rounded-2xl border border-akari-border bg-akari-card p-3 sm:p-4">
              <p className="text-xs text-akari-primary mb-1 uppercase tracking-[0.1em]">AI Markets</p>
              <p className="text-sm mb-1 text-akari-text">Artificial Intelligence</p>
              {narrative && narrative.topTokens.length > 0 ? (
                <>
                  <p className="text-[11px] text-akari-muted mb-2">
                    Top 3: {narrative.topTokens.map((t) => t.symbol).join(', ')}
                  </p>
                  <p className="text-[11px] text-akari-muted">
                    Total MC: {formatLargeNumber(narrative.totalMarketCapUsd)} • Avg 24h:{' '}
                    <span
                      className={
                        narrative.avgChange24hPct >= 0 ? 'text-green-400' : 'text-red-400'
                      }
                    >
                      {narrative.avgChange24hPct >= 0 ? '+' : ''}
                      {narrative.avgChange24hPct.toFixed(2)}%
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-akari-muted">
                  Track AI tokens and projects. Monitor price movements and create prediction markets.
                </p>
              )}
            </div>
          );
        })()}

        {/* GameFi */}
        {(() => {
          const narrative = narratives.find((n) => n.key === 'gamefi');
          return (
            <div className="rounded-2xl border border-akari-border bg-akari-card p-3 sm:p-4">
              <p className="text-xs text-akari-accent mb-1 uppercase tracking-[0.1em]">GameFi</p>
              <p className="text-sm mb-1 text-akari-text">Gaming & NFTs</p>
              {narrative && narrative.topTokens.length > 0 ? (
                <>
                  <p className="text-[11px] text-akari-muted mb-2">
                    Top 3: {narrative.topTokens.map((t) => t.symbol).join(', ')}
                  </p>
                  <p className="text-[11px] text-akari-muted">
                    Total MC: {formatLargeNumber(narrative.totalMarketCapUsd)} • Avg 24h:{' '}
                    <span
                      className={
                        narrative.avgChange24hPct >= 0 ? 'text-green-400' : 'text-red-400'
                      }
                    >
                      {narrative.avgChange24hPct >= 0 ? '+' : ''}
                      {narrative.avgChange24hPct.toFixed(2)}%
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-akari-muted">
                  Gaming tokens, NFT projects and metaverse assets. Follow trends and bet on outcomes.
                </p>
              )}
            </div>
          );
        })()}

        {/* InfoFi */}
        {(() => {
          const narrative = narratives.find((n) => n.key === 'infofi');
          return (
            <div className="rounded-2xl border border-akari-border bg-akari-card p-3 sm:p-4">
              <p className="text-xs text-akari-profit mb-1 uppercase tracking-[0.1em]">InfoFi</p>
              <p className="text-sm mb-1 text-akari-text">Information Finance</p>
              {narrative && narrative.topTokens.length > 0 ? (
                <>
                  <p className="text-[11px] text-akari-muted mb-2">
                    Top 3: {narrative.topTokens.map((t) => t.symbol).join(', ')}
                  </p>
                  <p className="text-[11px] text-akari-muted">
                    Total MC: {formatLargeNumber(narrative.totalMarketCapUsd)} • Avg 24h:{' '}
                    <span
                      className={
                        narrative.avgChange24hPct >= 0 ? 'text-green-400' : 'text-red-400'
                      }
                    >
                      {narrative.avgChange24hPct >= 0 ? '+' : ''}
                      {narrative.avgChange24hPct.toFixed(2)}%
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-akari-muted">
                  Oracle networks, data tokens and information markets. Predict data value and usage.
                </p>
              )}
            </div>
          );
        })()}

        {/* DeFi & L2s */}
        {(() => {
          const narrative = narratives.find((n) => n.key === 'defi_l2');
          return (
            <div className="rounded-2xl border border-akari-border bg-akari-card p-3 sm:p-4">
              <p className="text-xs text-akari-primary mb-1 uppercase tracking-[0.1em]">DeFi & L2s</p>
              <p className="text-sm mb-1 text-akari-text">Decentralized Finance</p>
              {narrative && narrative.topTokens.length > 0 ? (
                <>
                  <p className="text-[11px] text-akari-muted mb-2">
                    Top 3: {narrative.topTokens.map((t) => t.symbol).join(', ')}
                  </p>
                  <p className="text-[11px] text-akari-muted">
                    Total MC: {formatLargeNumber(narrative.totalMarketCapUsd)} • Avg 24h:{' '}
                    <span
                      className={
                        narrative.avgChange24hPct >= 0 ? 'text-green-400' : 'text-red-400'
                      }
                    >
                      {narrative.avgChange24hPct >= 0 ? '+' : ''}
                      {narrative.avgChange24hPct.toFixed(2)}%
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-akari-muted">
                  DeFi protocols, Layer 2 solutions and scaling technologies. Track TVL and adoption.
                </p>
              )}
            </div>
          );
        })()}

        {/* SportFi - Keep static for now */}
        <div className="rounded-2xl border border-akari-border bg-akari-card p-3 sm:p-4">
          <p className="text-xs text-akari-accent mb-1 uppercase tracking-[0.1em]">SportFi</p>
          <p className="text-sm mb-1 text-akari-text">Sports & Betting</p>
          <p className="text-[11px] text-akari-muted">
            Sports tokens, fan tokens and betting markets. Predict match outcomes and token performance.
          </p>
        </div>

        {/* Top Gainers 24h / Volume Leaders */}
        <div className="rounded-2xl border border-akari-border bg-akari-card p-3 sm:p-4">
          <p className="text-xs text-akari-muted mb-1">Top Gainers 24h</p>
          <p className="text-sm mb-1 text-akari-text">Volume Leaders</p>
          {volumeLeaders.length > 0 ? (
            <div className="space-y-1.5 mt-2">
              {volumeLeaders.slice(0, 5).map((leader) => {
                const changeColor = leader.change24hPct >= 0 ? 'text-green-400' : 'text-red-400';
                return (
                  <div key={leader.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 text-[11px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-akari-text font-medium">{leader.symbol}</span>
                      <span className="text-akari-muted text-[10px] sm:text-[11px]">{formatPrice(leader.priceUsd)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`${changeColor} font-medium text-[10px] sm:text-[11px]`}>
                        {leader.change24hPct >= 0 ? '+' : ''}
                        {leader.change24hPct.toFixed(2)}%
                      </span>
                      <span className="text-akari-muted text-[9px] sm:text-[10px]">
                        {formatVolumeOrMarketCap(leader.volume24hUsd)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-akari-muted">
              No data available at this time.
            </p>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}

export const getServerSideProps: GetServerSideProps<MarketsPageProps> = async () => {
  try {
    const [
      pulse,
      highlights,
      marketSnapshots,
      whaleData,
      narratives,
      volumeLeaders,
      signalData,
    ] = await Promise.all([
      getMarketPulse().catch(() => null),
      getAkariHighlights().catch(() => null),
      getLatestMarketSnapshots(20).catch(() => []),
      getWhaleEntriesWithFallback({
        recentHours: 24,
        fallbackDays: 7,
      }).catch(() => ({ recent: [], lastAny: null })),
      getNarrativeSummaries().catch(() => []),
      getVolumeLeaders(5).catch(() => []),
      getLiquiditySignalsWithFallback({
        recentHours: 24,
        fallbackDays: 3,
        limit: 10,
      }).catch(() => ({ recent: [], lastAny: null })),
    ]);

    // Map market snapshots to serializable DTOs
    const trending: MarketSnapshotDto[] = marketSnapshots.map((s: MarketSnapshot) => ({
      id: s.id,
      symbol: s.symbol,
      name: s.name,
      priceUsd: s.priceUsd,
      marketCapUsd: s.marketCapUsd,
      volume24hUsd: s.volume24hUsd,
      change24hPct: s.change24hPct,
      source: s.source,
      createdAt: s.createdAt.toISOString(),
    }));

    // Map whale entries to serializable DTOs
    const whaleEntriesRecent: WhaleEntryDto[] = whaleData.recent.map((w: any) => ({
      id: w.id,
      tokenSymbol: w.tokenSymbol,
      chain: w.chain,
      wallet: w.wallet,
      amountUsd: Number(w.amountUsd),
      occurredAt: w.occurredAt.toISOString(),
    }));

    const whaleLastAny: WhaleEntryDto | null = whaleData.lastAny
      ? {
          id: whaleData.lastAny.id,
          tokenSymbol: whaleData.lastAny.tokenSymbol,
          chain: whaleData.lastAny.chain,
          wallet: whaleData.lastAny.wallet,
          amountUsd: Number(whaleData.lastAny.amountUsd),
          occurredAt: whaleData.lastAny.occurredAt.toISOString(),
        }
      : null;

    // Map liquidity signals to serializable DTOs
    const liquiditySignalsRecent: LiquiditySignalDto[] = signalData.recent.map((s: any) => ({
      id: s.id,
      type: s.type,
      title: s.title,
      description: s.description,
      severity: s.severity,
      chain: s.chain,
      stableSymbol: s.stableSymbol,
      tokenSymbol: s.tokenSymbol,
      triggeredAt: s.triggeredAt.toISOString(),
    }));

    const liquidityLastAny: LiquiditySignalDto | null = signalData.lastAny
      ? {
          id: signalData.lastAny.id,
          type: signalData.lastAny.type,
          title: signalData.lastAny.title,
          description: signalData.lastAny.description,
          severity: signalData.lastAny.severity,
          chain: signalData.lastAny.chain,
          stableSymbol: signalData.lastAny.stableSymbol,
          tokenSymbol: signalData.lastAny.tokenSymbol,
          triggeredAt: signalData.lastAny.triggeredAt.toISOString(),
        }
      : null;

    return {
      props: {
        pulse: pulse ? JSON.parse(JSON.stringify(pulse)) : null,
        highlights: highlights ? JSON.parse(JSON.stringify(highlights)) : null,
        trending: JSON.parse(JSON.stringify(trending)),
        whaleEntriesRecent: JSON.parse(JSON.stringify(whaleEntriesRecent)),
        whaleLastAny: whaleLastAny ? JSON.parse(JSON.stringify(whaleLastAny)) : null,
        narratives: JSON.parse(JSON.stringify(narratives)),
        volumeLeaders: JSON.parse(JSON.stringify(volumeLeaders)),
        liquiditySignalsRecent: JSON.parse(JSON.stringify(liquiditySignalsRecent)),
        liquidityLastAny: liquidityLastAny
          ? JSON.parse(JSON.stringify(liquidityLastAny))
          : null,
      },
    };
  } catch (error: any) {
    console.error('[Markets Page] Error fetching market data:', error);
    return {
      props: {
        pulse: null,
        highlights: null,
        trending: [],
        whaleEntriesRecent: [],
        whaleLastAny: null,
        narratives: [],
        volumeLeaders: [],
        liquiditySignalsRecent: [],
        liquidityLastAny: null,
        error: 'Failed to load market data',
      },
    };
  }
};
