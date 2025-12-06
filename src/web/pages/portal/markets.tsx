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
  getDexSnapshotsForSymbols,
  getCexSnapshotsForSymbols,
  getTopDexByLiquidity,
  getLatestDexSnapshots,
  getLatestCexSnapshots,
  getDexLiquiditySnapshots,
  getCexMarketSnapshots,
  getDexLiquidityRadar,
  getCexMarketHeatmap,
  getPortalMarketOverview,
  getEnhancedChainFlowRadar,
  getWhaleRadar,
  getTrendingMarkets,
  getMemeRadarSnapshot,
  getChainVolumeAggregation,
  type DexLiquidityRow,
  type CexMarketRow,
  type ChainFlowRow,
  type WhaleRadarRow,
  type TrendingMarketRow,
  type MemeRadarRow,
  type ChainVolumeRow,
} from '../../lib/portal/db';
import { getTrackedMarketMetrics, formatMetricValue } from '../../lib/portal/metrics';
import { prisma } from '../../lib/prisma';
import { fetchMajorPricesFromBinance } from '../../services/coingecko';
import type { MarketSnapshot, DexMarketSnapshot, CexMarketSnapshot } from '@prisma/client';
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
import { chainIcon, formatChainLabel, chainBadgeColor } from '../../lib/portal/chains';
import Link from 'next/link';

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

// Simple type for live price preview
interface LivePricePreview {
  symbol: string;
  name: string;
  priceUsd: number;
}

// DEX snapshot DTO for SSR (matches new schema)
interface DexSnapshotDto {
  symbol: string | null;
  name: string | null;
  chain: string | null;
  dex: string | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  priceUsd: number | null;
}

// CEX snapshot DTO for SSR (matches new schema)
interface CexSnapshotDto {
  symbol: string;
  baseAsset: string | null;
  quoteAsset: string | null;
  source: string;
  priceUsd: number | null;
  volume24hUsd: number | null;
}

// Aggregated trading venue info per symbol
interface TradingVenueInfo {
  symbol: string;
  dexLiquidityUsd: number | null;
  dexVolume24hUsd: number | null;
  dexSources: string[]; // 'dex' field values
  cexSources: string[]; // 'source' field values
}

// Top DEX liquidity entry (matches new schema)
interface TopDexEntry {
  symbol: string | null;
  name: string | null;
  chain: string | null;
  dex: string | null;
  liquidityUsd: number;
  priceUsd: number | null;
}

// Chain Flow DTO for SSR
interface ChainFlowDto {
  chain: string;
  netFlow24hUsd: number;
  dominantStablecoin: string | null;
  signalLabel: string | null;
  lastUpdated: string;
}

// Chain Flow container (includes source indicator)
interface ChainFlowData {
  flows: ChainFlowDto[];
  source: 'stablecoin_flows' | 'dex_volume' | 'none';
}

// Whale Radar DTO for SSR
interface WhaleRadarDto {
  id: string;
  occurredAt: string;
  chain: string;
  tokenSymbol: string;
  side: 'Accumulating' | 'Distributing';
  sizeUsd: number;
  source: string;
}

// Trending Market DTO for SSR
interface TrendingMarketDto {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24hPct: number;
  volume24hUsd: number | null;
  lastUpdated: string;
}

// Meme Preview DTO for SSR
interface MemePreviewDto {
  symbol: string;
  name: string;
  chain: string | null;
  volume24hUsd: number | null;
  source: string;
}

interface MarketsPageProps {
  pulse: MarketPulse | null;
  highlights: AkariHighlights | null;
  trending: MarketSnapshotDto[];
  livePrices: LivePricePreview[]; // Binance fallback when no snapshots
  tradingVenues: TradingVenueInfo[]; // DEX/CEX info per symbol
  topDexLiquidity: TopDexEntry[]; // Top tokens by DEX liquidity
  dexSnapshots: DexSnapshotDto[]; // Latest DEX snapshots for DEX Radar card
  cexSnapshots: CexSnapshotDto[]; // Latest CEX snapshots for CEX Heatmap card
  dexLiquidityRows: DexLiquidityRow[]; // Deduplicated DEX rows
  cexMarketRows: CexMarketRow[]; // Deduplicated CEX rows
  trackedMarketCap: string; // Formatted tracked market cap
  trackedVolume24h: string; // Formatted tracked 24h volume
  // New radar data
  chainFlows: ChainFlowDto[];
  chainFlowSource: 'stablecoin_flows' | 'dex_volume' | 'none';
  whaleRadar: WhaleRadarDto[];
  trendingMarkets: TrendingMarketDto[];
  memePreview: MemePreviewDto[];
  whaleEntriesRecent: WhaleEntryDto[];
  whaleLastAny: WhaleEntryDto | null;
  narratives: NarrativeSummary[];
  volumeLeaders: VolumeLeader[];
  liquiditySignalsRecent: LiquiditySignalDto[];
  liquidityLastAny: LiquiditySignalDto | null;
  lastUpdated: string | null;
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
  livePrices,
  tradingVenues,
  topDexLiquidity,
  dexSnapshots,
  cexSnapshots,
  dexLiquidityRows,
  cexMarketRows,
  trackedMarketCap,
  trackedVolume24h,
  chainFlows,
  chainFlowSource,
  whaleRadar,
  trendingMarkets,
  memePreview,
  whaleEntriesRecent,
  whaleLastAny,
  narratives,
  volumeLeaders,
  liquiditySignalsRecent,
  liquidityLastAny,
  lastUpdated,
  error,
}: MarketsPageProps) {
  // Create a lookup map for trading venues by symbol
  const venuesBySymbol = React.useMemo(() => {
    const map = new Map<string, TradingVenueInfo>();
    for (const venue of tradingVenues) {
      map.set(venue.symbol.toUpperCase(), venue);
    }
    return map;
  }, [tradingVenues]);

  // Deduplicate DEX snapshots by symbol (highest liquidity wins)
  const topDexRadar = React.useMemo(() => {
    const map = new Map<string, DexSnapshotDto>();
    for (const snap of dexSnapshots) {
      if (!snap.symbol) continue;
      const existing = map.get(snap.symbol);
      if (!existing || (snap.liquidityUsd || 0) > (existing.liquidityUsd || 0)) {
        map.set(snap.symbol, snap);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0))
      .slice(0, 8);
  }, [dexSnapshots]);

  // Deduplicate CEX snapshots by symbol (highest volume wins)
  const topCexHeatmap = React.useMemo(() => {
    const map = new Map<string, CexSnapshotDto>();
    for (const snap of cexSnapshots) {
      if (!snap.symbol) continue;
      const existing = map.get(snap.symbol);
      if (!existing || (snap.volume24hUsd || 0) > (existing.volume24hUsd || 0)) {
        map.set(snap.symbol, snap);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0))
      .slice(0, 8);
  }, [cexSnapshots]);
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

      {/* Market Pulse - always show with fallback metrics */}
      {!error && (
        <div className="mb-6 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          <div className="rounded-2xl border border-akari-primary/30 bg-akari-card p-4">
            <p className="text-xs text-akari-primary mb-1 uppercase tracking-[0.1em]">Tracked Market Cap</p>
            <p className="text-lg font-semibold text-akari-text">
              {trackedMarketCap}
            </p>
          </div>
          <div className="rounded-2xl border border-akari-accent/30 bg-akari-card p-4">
            <p className="text-xs text-akari-accent mb-1 uppercase tracking-[0.1em]">Tracked 24h Volume</p>
            <p className="text-lg font-semibold text-akari-text">
              {trackedVolume24h}
            </p>
          </div>
          <div className="rounded-2xl border border-akari-profit/30 bg-akari-card p-4">
            <p className="text-xs text-akari-profit mb-1 uppercase tracking-[0.1em]">Data Sources</p>
            <p className="text-sm font-semibold text-akari-text">
              DEX + CEX aggregated from multiple providers.
            </p>
          </div>
        </div>
      )}

      {/* Top DEX Liquidity Card */}
      {!error && topDexLiquidity.length > 0 && (
        <div className="mb-6">
          <div className="rounded-2xl border border-green-500/30 bg-akari-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-akari-text">Top DEX Liquidity</h3>
                <p className="text-[10px] text-akari-muted">Highest liquidity pools from DexScreener & GeckoTerminal</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-green-500/15 px-2 py-1 text-[10px] font-medium text-green-400 uppercase tracking-[0.1em]">
                DEX
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {topDexLiquidity.slice(0, 6).map((entry, idx) => (
                <div key={`${entry.symbol || 'unknown'}-${idx}`} className="flex items-center justify-between p-2 bg-akari-cardSoft/50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-sm">
                      {chainIcon(entry.chain)}
                    </div>
                    <div>
                      <span className="text-xs font-medium text-akari-text uppercase">{entry.symbol || '—'}</span>
                      <p className="text-[9px] text-akari-muted">{formatChainLabel(entry.chain)} • {entry.dex || 'DEX'}</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-green-400">{formatLargeNumber(entry.liquidityUsd)}</span>
                </div>
              ))}
            </div>
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

      {/* Chain Flow Radar & Whale Radar */}
      {!error && (
        <section className="mb-6 grid gap-4 grid-cols-1 lg:grid-cols-2">
          {/* Chain Flow Radar */}
          <div className="rounded-2xl border border-emerald-500/30 bg-akari-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold text-akari-text">Chain Flow Radar</h3>
              {chainFlows.length > 0 && (
                <span className="text-[10px] text-akari-muted bg-akari-cardSoft px-2 py-0.5 rounded-full">
                  Updated {formatRelativeTime(chainFlows[0].lastUpdated)}
                </span>
              )}
            </div>
            <p className="text-xs text-akari-muted mb-4">
              {chainFlowSource === 'stablecoin_flows' 
                ? 'Stablecoin inflows/outflows across tracked chains, last 24h.'
                : chainFlowSource === 'dex_volume'
                ? 'DEX volume distribution by chain (stablecoin flow data warming up).'
                : 'Chain activity tracking across Ethereum, Solana, and Base.'}
            </p>
            {chainFlows.length > 0 ? (
              <div className="space-y-2">
                {chainFlows.map((flow, i) => {
                  const isInflow = flow.netFlow24hUsd >= 0;
                  const flowColor = isInflow ? 'text-green-400' : 'text-red-400';
                  const flowBg = isInflow ? 'bg-green-500/10' : 'bg-red-500/10';
                  return (
                    <div
                      key={`${flow.chain}-${i}`}
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs p-2 rounded-lg ${flowBg}`}
                    >
                      <div className="flex items-center gap-2 mb-1 sm:mb-0">
                        <span className="text-sm">{chainIcon(flow.chain)}</span>
                        <span className="text-akari-text font-medium capitalize">{flow.chain}</span>
                        {flow.signalLabel && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] hidden sm:inline">
                            {flow.signalLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span className={`font-medium ${flowColor}`}>
                          {isInflow ? '+' : ''}{formatLargeNumber(flow.netFlow24hUsd)}
                        </span>
                        {flow.dominantStablecoin && (
                          <span className="px-1.5 py-0.5 rounded bg-akari-cardSoft text-akari-muted text-[10px]">
                            {flow.dominantStablecoin}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-akari-muted">
                <p className="text-sm mb-2">No measurable stablecoin rotations</p>
                <p className="text-[10px]">Monitoring Ethereum, Solana, Base, and more.</p>
                <p className="text-[10px] mt-1">We&apos;ll surface rotations as they appear.</p>
              </div>
            )}
          </div>

          {/* Whale Radar */}
          <div className="rounded-2xl border border-violet-500/30 bg-akari-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold text-akari-text">Whale Radar – last 24h</h3>
              {whaleRadar.length > 0 && (
                <span className="text-[10px] text-akari-muted bg-akari-cardSoft px-2 py-0.5 rounded-full">
                  {whaleRadar.length} entries
                </span>
              )}
            </div>
            <p className="text-xs text-akari-muted mb-4">
              Large onchain and CEX trades from tracked wallets.
            </p>
            {whaleRadar.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {whaleRadar.map((whale, i) => {
                  const sideColor = whale.side === 'Accumulating' ? 'text-green-400 bg-green-500/15' : 'text-red-400 bg-red-500/15';
                  return (
                    <div
                      key={`${whale.id}-${i}`}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs p-2 rounded-lg bg-akari-cardSoft/50"
                    >
                      <div className="flex items-center gap-2 mb-1 sm:mb-0">
                        <span className="text-[10px] text-akari-muted min-w-[50px]">
                          {formatRelativeTime(whale.occurredAt)}
                        </span>
                        <span className="text-sm">{chainIcon(whale.chain)}</span>
                        <span className="text-akari-text font-medium uppercase">{whale.tokenSymbol}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${sideColor}`}>
                          {whale.side}
                        </span>
                        <span className="text-akari-text font-medium">{formatLargeNumber(whale.sizeUsd)}</span>
                        <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 text-[10px] hidden sm:inline">
                          {whale.source}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-akari-muted">
                <p className="text-sm mb-2">No whale entries in the last 24 hours</p>
                <p className="text-[10px]">We&apos;ll flag the next big wallets that move size.</p>
                <p className="text-[10px] mt-1">Tracking resumes automatically.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* DEX Liquidity Radar & CEX Market Heatmap */}
      {!error && (
        <section className="mb-6 grid gap-4 grid-cols-1 lg:grid-cols-2">
          {/* DEX Liquidity Radar */}
          <div className="rounded-2xl border border-cyan-500/30 bg-akari-card p-4 sm:p-5">
            <h3 className="text-base font-semibold text-akari-text mb-1">DEX Liquidity Radar</h3>
            <p className="text-xs text-akari-muted mb-4">
              Aggregated DEX liquidity and volume across Solana, Ethereum, and more.
            </p>
            {topDexRadar.length > 0 ? (
              <div className="space-y-2">
                {topDexRadar.map((snap, i) => (
                  <div
                    key={`${snap.symbol}-${snap.chain}-${i}`}
                    className="flex items-center justify-between text-xs p-2 rounded-lg bg-akari-cardSoft/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{chainIcon(snap.chain)}</span>
                      <span className="text-akari-text font-medium uppercase">{snap.symbol || '—'}</span>
                      {snap.name && <span className="text-akari-muted truncate max-w-[80px]">{snap.name}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <span className="text-akari-text">{snap.priceUsd ? formatPrice(snap.priceUsd) : '—'}</span>
                      </div>
                      <div className="text-cyan-400 font-medium min-w-[70px]">
                        {snap.liquidityUsd ? formatLargeNumber(snap.liquidityUsd) : '—'}
                      </div>
                      <div className="flex gap-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${chainBadgeColor(snap.chain)}`}>
                          {formatChainLabel(snap.chain)}
                        </span>
                        {snap.dex && (
                          <span className="px-1.5 py-0.5 rounded bg-akari-accent/20 text-akari-accent text-[10px]">
                            {snap.dex}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-akari-muted">
                <p className="text-sm mb-2">No fresh DEX data yet</p>
                <p className="text-[10px]">Our aggregator is collecting snapshots from DexScreener, GeckoTerminal, and Birdeye.</p>
                <p className="text-[10px] mt-1">Check back in a few minutes.</p>
              </div>
            )}
          </div>

          {/* CEX Market Heatmap */}
          <div className="rounded-2xl border border-amber-500/30 bg-akari-card p-4 sm:p-5">
            <h3 className="text-base font-semibold text-akari-text mb-1">CEX Market Heatmap</h3>
            <p className="text-xs text-akari-muted mb-4">
              Spot market leaders across Binance, OKX, KuCoin.
            </p>
            {topCexHeatmap.length > 0 ? (
              <div className="space-y-2">
                {topCexHeatmap.map((snap, i) => (
                  <div
                    key={`${snap.symbol}-${i}`}
                    className="flex items-center justify-between text-xs p-2 rounded-lg bg-akari-cardSoft/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-akari-text font-medium uppercase">{snap.symbol}</span>
                      {snap.baseAsset && snap.quoteAsset && (
                        <span className="text-akari-muted text-[10px]">
                          {snap.baseAsset}/{snap.quoteAsset}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <span className="text-akari-text">{snap.priceUsd ? formatPrice(snap.priceUsd) : '—'}</span>
                      </div>
                      <div className="text-amber-400 font-medium min-w-[70px]">
                        {snap.volume24hUsd ? formatLargeNumber(snap.volume24hUsd) : '—'}
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                        CEX
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-akari-muted">
                <p className="text-sm mb-2">No CEX tickers ranked yet</p>
                <p className="text-[10px]">Our aggregator fetches data from Binance, OKX, and KuCoin.</p>
                <p className="text-[10px] mt-1">If this persists, check the cron status.</p>
              </div>
            )}
          </div>
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
            <span className="text-xs text-akari-muted">Data source: CoinGecko + DEX/CEX enrichment</span>
          </div>
          
          {/* Desktop Table */}
          <div className="hidden md:block rounded-2xl border border-akari-accent/20 bg-akari-card overflow-hidden">
            <table className="w-full">
              <thead className="bg-akari-cardSoft border-b border-akari-border/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-akari-muted uppercase tracking-[0.1em]">Name</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-akari-muted uppercase tracking-[0.1em]">Price</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-akari-muted uppercase tracking-[0.1em]">Volume 24H</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-akari-muted uppercase tracking-[0.1em]">DEX Liq.</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-akari-muted uppercase tracking-[0.1em]">Where Trading</th>
                </tr>
              </thead>
              <tbody>
                {trending.map((coin, index) => {
                  const venue = venuesBySymbol.get(coin.symbol.toUpperCase());
                  return (
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
                        {venue?.dexLiquidityUsd ? (
                          <span className="text-sm text-green-400 font-medium">{formatLargeNumber(venue.dexLiquidityUsd)}</span>
                        ) : (
                          <span className="text-sm text-akari-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {venue?.dexSources && venue.dexSources.length > 0 && (
                            <span className="inline-flex items-center rounded-full bg-green-500/15 px-2 py-0.5 text-[9px] font-medium text-green-400 uppercase">
                              DEX
                            </span>
                          )}
                          {venue?.cexSources && venue.cexSources.map(ex => (
                            <span 
                              key={ex} 
                              className="inline-flex items-center rounded-full bg-blue-500/15 px-2 py-0.5 text-[9px] font-medium text-blue-400 uppercase"
                            >
                              {ex}
                            </span>
                          ))}
                          {(!venue || (venue.dexSources.length === 0 && venue.cexSources.length === 0)) && (
                            <span className="text-[10px] text-akari-muted">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Grid */}
          <div className="md:hidden grid gap-3">
            {trending.map((coin, index) => {
              const venue = venuesBySymbol.get(coin.symbol.toUpperCase());
              return (
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
                    {/* Trading venues badges */}
                    <div className="flex flex-wrap gap-1 justify-end">
                      {venue?.dexSources && venue.dexSources.length > 0 && (
                        <span className="inline-flex items-center rounded-full bg-green-500/15 px-1.5 py-0.5 text-[8px] font-medium text-green-400 uppercase">
                          DEX
                        </span>
                      )}
                      {venue?.cexSources && venue.cexSources.slice(0, 2).map(ex => (
                        <span 
                          key={ex} 
                          className="inline-flex items-center rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[8px] font-medium text-blue-400 uppercase"
                        >
                          {ex.slice(0, 3)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-akari-primary">{formatPrice(coin.priceUsd)}</span>
                    {venue?.dexLiquidityUsd && (
                      <span className="text-[10px] text-green-400">Liq: {formatLargeNumber(venue.dexLiquidityUsd)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State - when no snapshots */}
      {!error && trending.length === 0 && (
        <div className="mb-6">
          <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-6 mb-4">
            <p className="text-sm text-akari-muted text-center">
              Waiting for first market snapshot. Check back in a few minutes.
            </p>
          </div>
          
          {/* Live Preview Fallback from Binance */}
          {livePrices.length > 0 && (
            <div className="rounded-2xl border border-akari-primary/20 bg-akari-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-akari-text">Major Markets (Live Preview)</h3>
                <span className="text-[10px] text-akari-muted uppercase tracking-[0.1em]">Binance</span>
              </div>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                {livePrices.map((coin) => (
                  <div key={coin.symbol} className="flex items-center justify-between p-3 bg-akari-cardSoft/50 rounded-xl">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-akari-primary/20 flex items-center justify-center text-akari-primary text-[10px] font-bold">
                        {coin.symbol.charAt(0)}
                      </div>
                      <div>
                        <span className="text-xs font-medium text-akari-text">{coin.name}</span>
                        <p className="text-[10px] text-akari-muted">{coin.symbol}</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-akari-primary">{formatPrice(coin.priceUsd)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                  Will track AI tokens, narratives and prediction pools as soon as category data is switched on. Top tokens like RENDER, FET, and TAO monitored.
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
                  Will surface gaming tokens and NFT projects once category filters go live. Track IMX, AXS, GALA and metaverse plays.
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
                  Will track oracle networks and data tokens (LINK, PYTH, API3) plus info marketplaces as category logic is wired.
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
                  Will show L2 adoption, DeFi rotation and TVL-linked prediction plays. ARB, OP, UNI, AAVE and more.
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

        {/* Trending Markets Card */}
        <div className="rounded-2xl border border-akari-border bg-akari-card p-3 sm:p-4">
          <p className="text-xs text-akari-primary mb-1 uppercase tracking-[0.1em]">Top Movers</p>
          <p className="text-sm mb-1 text-akari-text font-medium">Trending</p>
          {trendingMarkets.length > 0 ? (
            <div className="space-y-1.5 mt-2">
              {trendingMarkets.slice(0, 4).map((market) => {
                const changeColor = market.change24hPct >= 0 ? 'text-green-400' : 'text-red-400';
                return (
                  <div key={market.id} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1">
                      <span className="text-akari-text font-medium">{market.symbol}</span>
                      <span className="text-akari-muted text-[10px] hidden sm:inline">{market.name}</span>
                    </div>
                    <span className={`${changeColor} font-medium`}>
                      {market.change24hPct >= 0 ? '+' : ''}{market.change24hPct.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-akari-muted">
              Trending data warming up. First snapshot appears after the next CoinGecko sync.
            </p>
          )}
        </div>

        {/* Meme Radar Preview */}
        <div className="rounded-2xl border border-purple-500/30 bg-akari-card p-3 sm:p-4">
          <p className="text-xs text-purple-400 mb-1 uppercase tracking-[0.1em]">Quick Look</p>
          <p className="text-sm mb-1 text-akari-text font-medium">Meme Radar</p>
          {memePreview.length > 0 ? (
            <div className="space-y-1.5 mt-2">
              {memePreview.map((meme, idx) => (
                <div key={`${meme.symbol}-${idx}`} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1">
                    <span className="text-sm">{chainIcon(meme.chain)}</span>
                    <span className="text-akari-text font-medium uppercase">{meme.symbol}</span>
                  </div>
                  <span className="text-purple-400 text-[10px]">
                    {meme.volume24hUsd ? formatLargeNumber(meme.volume24hUsd) : '—'}
                  </span>
                </div>
              ))}
              <Link
                href="/portal/memes"
                className="block text-[10px] text-akari-primary hover:text-akari-accent mt-2 transition-colors"
              >
                Open full Meme Radar →
              </Link>
            </div>
          ) : (
            <p className="text-[11px] text-akari-muted">
              Meme data warming up. Visit the full Meme Radar page for details.
            </p>
          )}
        </div>

        {/* Launchpad Winners */}
        <div className="rounded-2xl border border-akari-border bg-akari-card p-3 sm:p-4">
          <p className="text-xs text-akari-accent mb-1 uppercase tracking-[0.1em]">Coming Soon</p>
          <p className="text-sm mb-1 text-akari-text font-medium">Launchpad Winners</p>
          <p className="text-[11px] text-akari-muted">
            This panel will showcase best ROI from AKARI launchpad campaigns once wired. For now, launch data is only visible internally.
          </p>
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
      topDexSnapshots,
      latestDexSnapshots,
      latestCexSnapshots,
      dexLiquidityRows,
      cexMarketRows,
      trackedMetrics,
      portalOverview,
      chainFlowsRaw,
      whaleRadarRaw,
      trendingMarketsRaw,
      memeRadarResult,
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
      getTopDexByLiquidity(10).catch(() => []),
      getLatestDexSnapshots(30).catch(() => []),
      getLatestCexSnapshots(30).catch(() => []),
      getDexLiquiditySnapshots(20).catch(() => []),
      getCexMarketSnapshots(20).catch(() => []),
      getTrackedMarketMetrics(prisma).catch(() => ({ totalMarketCapUsd: null, totalVolume24hUsd: null, source: 'none' as const })),
      getPortalMarketOverview().catch(() => ({ trackedMarketCapUsd: 0, trackedVolume24hUsd: 0, lastUpdated: null })),
      getEnhancedChainFlowRadar(8).catch(() => ({ flows: [], source: 'none' as const, lastUpdated: null })),
      getWhaleRadar(10, 24).catch(() => []),
      getTrendingMarkets(6).catch(() => []),
      getMemeRadarSnapshot(3).catch(() => ({ memes: [], source: 'none' as const, lastUpdated: null })),
    ]);

    // If no market snapshots, fetch live prices from Binance as a fallback
    let livePrices: LivePricePreview[] = [];
    if (marketSnapshots.length === 0) {
      try {
        livePrices = await fetchMajorPricesFromBinance();
      } catch (e) {
        console.error('[Markets Page] Binance fallback failed:', e);
      }
    }

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

    // Fetch DEX/CEX data for symbols in market snapshots
    const symbols = marketSnapshots.map((s: MarketSnapshot) => s.symbol);
    let dexSnapshots: DexMarketSnapshot[] = [];
    let cexSnapshots: CexMarketSnapshot[] = [];
    
    if (symbols.length > 0) {
      [dexSnapshots, cexSnapshots] = await Promise.all([
        getDexSnapshotsForSymbols(symbols).catch(() => []),
        getCexSnapshotsForSymbols(symbols).catch(() => []),
      ]);
    }

    // Aggregate DEX/CEX data per symbol
    const tradingVenues: TradingVenueInfo[] = [];
    const symbolSet = new Set(symbols.map((s: string) => s.toUpperCase()));
    
    for (const symbol of symbolSet) {
      const dexForSymbol = dexSnapshots.filter(
        (d: DexMarketSnapshot) => d.symbol?.toUpperCase() === symbol
      );
      const cexForSymbol = cexSnapshots.filter(
        (c: CexMarketSnapshot) => c.symbol.toUpperCase() === symbol
      );

      // Get max liquidity and sum volume from DEX sources
      const maxDexLiquidity = dexForSymbol.length > 0
        ? Math.max(...dexForSymbol.map((d: DexMarketSnapshot) => d.liquidityUsd || 0))
        : null;
      const totalDexVolume = dexForSymbol.reduce(
        (sum: number, d: DexMarketSnapshot) => sum + (d.volume24hUsd || 0),
        0
      );

      // Use 'dex' field for DEX sources, 'source' field for CEX
      tradingVenues.push({
        symbol,
        dexLiquidityUsd: maxDexLiquidity && maxDexLiquidity > 0 ? maxDexLiquidity : null,
        dexVolume24hUsd: totalDexVolume > 0 ? totalDexVolume : null,
        dexSources: [...new Set(dexForSymbol.map((d: DexMarketSnapshot) => d.dex).filter(Boolean))] as string[],
        cexSources: [...new Set(cexForSymbol.map((c: CexMarketSnapshot) => c.source))],
      });
    }

    // Map top DEX liquidity entries
    const topDexLiquidity: TopDexEntry[] = topDexSnapshots
      .filter((d: DexMarketSnapshot) => d.liquidityUsd && d.liquidityUsd > 0)
      .map((d: DexMarketSnapshot) => ({
        symbol: d.symbol,
        name: d.name,
        chain: d.chain,
        dex: d.dex,
        liquidityUsd: d.liquidityUsd!,
        priceUsd: d.priceUsd,
      }));

    // Map latest DEX snapshots for DEX Radar card
    const dexSnapshotsDto: DexSnapshotDto[] = latestDexSnapshots
      .filter((d: DexMarketSnapshot) => d.symbol)
      .map((d: DexMarketSnapshot) => ({
        symbol: d.symbol,
        name: d.name,
        chain: d.chain,
        dex: d.dex,
        liquidityUsd: d.liquidityUsd,
        volume24hUsd: d.volume24hUsd,
        priceUsd: d.priceUsd,
      }));

    // Map latest CEX snapshots for CEX Heatmap card
    const cexSnapshotsDto: CexSnapshotDto[] = latestCexSnapshots.map((c: CexMarketSnapshot) => ({
      symbol: c.symbol,
      baseAsset: c.baseAsset,
      quoteAsset: c.quoteAsset,
      source: c.source,
      priceUsd: c.priceUsd,
      volume24hUsd: c.volume24hUsd,
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

    // Map chain flows to serializable DTOs (chainFlowsRaw is now { flows, source, lastUpdated })
    const chainFlows: ChainFlowDto[] = chainFlowsRaw.flows.map((f: ChainFlowRow) => ({
      chain: f.chain,
      netFlow24hUsd: f.netFlow24hUsd,
      dominantStablecoin: f.dominantStablecoin,
      signalLabel: f.signalLabel,
      lastUpdated: f.lastUpdated.toISOString(),
    }));
    const chainFlowSource = chainFlowsRaw.source;

    // Map whale radar to serializable DTOs
    const whaleRadar: WhaleRadarDto[] = whaleRadarRaw.map((w: WhaleRadarRow) => ({
      id: w.id,
      occurredAt: w.occurredAt.toISOString(),
      chain: w.chain,
      tokenSymbol: w.tokenSymbol,
      side: w.side,
      sizeUsd: w.sizeUsd,
      source: w.source,
    }));

    // Map trending markets to serializable DTOs
    const trendingMarkets: TrendingMarketDto[] = trendingMarketsRaw.map((t: TrendingMarketRow) => ({
      id: t.id,
      symbol: t.symbol,
      name: t.name,
      priceUsd: t.priceUsd,
      change24hPct: t.change24hPct,
      volume24hUsd: t.volume24hUsd,
      lastUpdated: t.lastUpdated.toISOString(),
    }));

    // Map meme preview to serializable DTOs
    const memePreview: MemePreviewDto[] = memeRadarResult.memes.slice(0, 3).map((m: MemeRadarRow) => ({
      symbol: m.symbol,
      name: m.name,
      chain: m.chain,
      volume24hUsd: m.volume24hUsd,
      source: m.source,
    }));

    // Determine last updated time
    const lastUpdated = portalOverview.lastUpdated?.toISOString() || null;

    return {
      props: {
        pulse: pulse ? JSON.parse(JSON.stringify(pulse)) : null,
        highlights: highlights ? JSON.parse(JSON.stringify(highlights)) : null,
        trending: JSON.parse(JSON.stringify(trending)),
        livePrices: JSON.parse(JSON.stringify(livePrices)),
        tradingVenues: JSON.parse(JSON.stringify(tradingVenues)),
        topDexLiquidity: JSON.parse(JSON.stringify(topDexLiquidity)),
        dexSnapshots: JSON.parse(JSON.stringify(dexSnapshotsDto)),
        cexSnapshots: JSON.parse(JSON.stringify(cexSnapshotsDto)),
        dexLiquidityRows: JSON.parse(JSON.stringify(dexLiquidityRows)),
        cexMarketRows: JSON.parse(JSON.stringify(cexMarketRows)),
        trackedMarketCap: formatMetricValue(trackedMetrics.totalMarketCapUsd),
        trackedVolume24h: formatMetricValue(trackedMetrics.totalVolume24hUsd),
        chainFlows: JSON.parse(JSON.stringify(chainFlows)),
        chainFlowSource,
        whaleRadar: JSON.parse(JSON.stringify(whaleRadar)),
        trendingMarkets: JSON.parse(JSON.stringify(trendingMarkets)),
        memePreview: JSON.parse(JSON.stringify(memePreview)),
        whaleEntriesRecent: JSON.parse(JSON.stringify(whaleEntriesRecent)),
        whaleLastAny: whaleLastAny ? JSON.parse(JSON.stringify(whaleLastAny)) : null,
        narratives: JSON.parse(JSON.stringify(narratives)),
        volumeLeaders: JSON.parse(JSON.stringify(volumeLeaders)),
        liquiditySignalsRecent: JSON.parse(JSON.stringify(liquiditySignalsRecent)),
        liquidityLastAny: liquidityLastAny
          ? JSON.parse(JSON.stringify(liquidityLastAny))
          : null,
        lastUpdated,
      },
    };
  } catch (error: unknown) {
    console.error('[Markets Page] Error fetching market data:', error);
    return {
      props: {
        pulse: null,
        highlights: null,
        trending: [],
        livePrices: [],
        tradingVenues: [],
        topDexLiquidity: [],
        dexSnapshots: [],
        cexSnapshots: [],
        dexLiquidityRows: [],
        cexMarketRows: [],
        trackedMarketCap: 'Data warming up',
        trackedVolume24h: 'Data warming up',
        chainFlows: [],
        chainFlowSource: 'none',
        whaleRadar: [],
        trendingMarkets: [],
        memePreview: [],
        whaleEntriesRecent: [],
        whaleLastAny: null,
        narratives: [],
        volumeLeaders: [],
        liquiditySignalsRecent: [],
        liquidityLastAny: null,
        lastUpdated: null,
        error: 'Failed to load market data',
      },
    };
  }
};
