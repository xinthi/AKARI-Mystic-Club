import React from 'react';
import { GetServerSideProps } from 'next';
import { PortalLayout } from '../../components/portal/PortalLayout';
import {
  getLatestMarketSnapshots,
  getDexSnapshotsForSymbols,
  getCexSnapshotsForSymbols,
  getTopDexByLiquidity,
  getLatestDexSnapshots,
  getLatestCexSnapshots,
  getPortalMarketOverview,
  getEnhancedChainFlowRadar,
  getWhaleRadar,
  getTrendingMarkets,
  getMemeRadarSnapshot,
  type ChainFlowRow,
  type WhaleRadarRow,
  type TrendingMarketRow,
  type MemeRadarRow,
  isMajorToken,
} from '../../lib/portal/db';
import { getTrackedMarketMetrics, formatMetricValue } from '../../lib/portal/metrics';
import { prisma } from '../../lib/prisma';
import type { MarketSnapshot, DexMarketSnapshot, CexMarketSnapshot } from '@prisma/client';
import { chainIcon, formatChainLabel, chainBadgeColor } from '../../lib/portal/chains';
import Link from 'next/link';

// ============ TYPES ============
interface MarketSnapshotDto {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  volume24hUsd: number | null;
  change24hPct: number | null;
}

interface DexSnapshotDto {
  symbol: string | null;
  name: string | null;
  chain: string | null;
  dex: string | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  priceUsd: number | null;
}

interface CexSnapshotDto {
  symbol: string;
  baseAsset: string | null;
  quoteAsset: string | null;
  source: string;
  priceUsd: number | null;
  volume24hUsd: number | null;
}

interface ChainFlowDto {
  chain: string;
  netFlow24hUsd: number;
  signalLabel: string | null;
}

interface WhaleRadarDto {
  id: string;
  occurredAt: string;
  chain: string;
  tokenSymbol: string;
  side: 'Accumulating' | 'Distributing';
  sizeUsd: number;
}

interface TrendingMarketDto {
  symbol: string;
  name: string;
  change24hPct: number;
}

interface MemePreviewDto {
  symbol: string;
  chain: string | null;
  volume24hUsd: number | null;
}

interface MarketsPageProps {
  trackedMarketCap: string;
  trackedVolume24h: string;
  trending: MarketSnapshotDto[];
  dexRadar: DexSnapshotDto[];
  cexHeatmap: CexSnapshotDto[];
  chainFlows: ChainFlowDto[];
  whaleRadar: WhaleRadarDto[];
  trendingMarkets: TrendingMarketDto[];
  memePreview: MemePreviewDto[];
  lastUpdated: string | null;
  error?: string;
}

// ============ FORMATTERS ============
function formatPrice(price: number): string {
  if (price >= 1) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(price);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 4, maximumFractionDigits: 6,
  }).format(price);
}

function formatLargeNumber(num: number | null): string {
  if (num === null || num === 0) return 'N/A';
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// ============ COMPONENT ============
export default function MarketsPage({
  trackedMarketCap,
  trackedVolume24h,
  trending,
  dexRadar,
  cexHeatmap,
  chainFlows,
  whaleRadar,
  trendingMarkets,
  memePreview,
  lastUpdated,
  error,
}: MarketsPageProps) {

  // Check if we have any meaningful data
  const hasMarketData = trending.length > 0 || dexRadar.length > 0 || cexHeatmap.length > 0;

  if (error) {
    return (
      <PortalLayout title="Markets">
        <h1 className="text-xl font-semibold text-akari-text mb-2">Markets</h1>
        <p className="text-xs text-red-400">Market data sync failed. Retrying on next cron run.</p>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Markets">
      {/* Header */}
      <section className="mb-10">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-gradient-teal">Markets</h1>
            <p className="text-sm text-akari-muted">DEX + CEX aggregated signals</p>
          </div>
          {lastUpdated && (
            <span className="pill-neon text-xs text-akari-muted bg-akari-cardSoft/50 border border-akari-neon-teal/20 px-3 py-1.5">
              {timeAgo(lastUpdated)}
            </span>
          )}
        </div>
      </section>

      {/* Summary Stats - only show if we have real data */}
      {hasMarketData && (
        <div className="mb-8 grid gap-4 grid-cols-2 sm:grid-cols-3">
          <div className="neon-card neon-hover p-5">
            <p className="text-xs text-gradient-teal uppercase tracking-wider font-semibold mb-2">Market Cap</p>
            <p className="text-lg font-bold text-gradient-akari">{trackedMarketCap}</p>
          </div>
          <div className="neon-card neon-hover p-5">
            <p className="text-xs text-gradient-blue uppercase tracking-wider font-semibold mb-2">24h Volume</p>
            <p className="text-lg font-bold text-gradient-followers">{trackedVolume24h}</p>
          </div>
          <div className="hidden sm:block neon-card neon-hover p-5">
            <p className="text-xs text-akari-muted uppercase tracking-wider font-semibold mb-2">Sources</p>
            <p className="text-sm text-akari-text font-medium">DexScreener · GeckoTerminal · Binance · OKX</p>
          </div>
        </div>
      )}

      {/* DEX & CEX side by side */}
      {(dexRadar.length > 0 || cexHeatmap.length > 0) && (
        <div className="mb-8 grid gap-6 grid-cols-1 lg:grid-cols-2">
          {/* DEX Liquidity Radar */}
          {dexRadar.length > 0 && (
            <div className="neon-card neon-hover p-5">
              <h3 className="text-sm font-bold text-gradient-blue mb-4">DEX Liquidity</h3>
              <div className="space-y-2">
                {dexRadar.slice(0, 8).map((snap, i) => (
                  <div key={`dex-${snap.symbol}-${i}`} className="flex items-center justify-between text-sm p-3 rounded-xl bg-akari-cardSoft/50 border border-akari-neon-teal/10 transition-all duration-300 hover:border-akari-neon-teal/30 hover:bg-akari-cardSoft/70">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-lg">{chainIcon(snap.chain)}</span>
                      <span className="text-akari-text font-semibold uppercase truncate">{snap.symbol || 'N/A'}</span>
                      <span className={`pill-neon px-2 py-0.5 text-[10px] hidden sm:inline font-medium border ${chainBadgeColor(snap.chain)}`}>
                        {formatChainLabel(snap.chain)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-akari-muted text-xs">{snap.priceUsd ? formatPrice(snap.priceUsd) : ''}</span>
                      <span className="text-gradient-followers font-semibold">{formatLargeNumber(snap.liquidityUsd)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CEX Heatmap */}
          {cexHeatmap.length > 0 && (
            <div className="neon-card neon-hover p-5">
              <h3 className="text-sm font-bold text-gradient-heat mb-4">CEX Volume</h3>
              <div className="space-y-2">
                {cexHeatmap.slice(0, 8).map((snap, i) => (
                  <div key={`cex-${snap.symbol}-${i}`} className="flex items-center justify-between text-sm p-3 rounded-xl bg-akari-cardSoft/50 border border-akari-neon-teal/10 transition-all duration-300 hover:border-akari-neon-teal/30 hover:bg-akari-cardSoft/70">
                    <div className="flex items-center gap-2.5">
                      <span className="text-akari-text font-semibold uppercase">{snap.symbol}</span>
                      {snap.baseAsset && snap.quoteAsset && (
                        <span className="text-akari-muted text-xs">{snap.baseAsset}/{snap.quoteAsset}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-akari-muted text-xs">{snap.priceUsd ? formatPrice(snap.priceUsd) : ''}</span>
                      <span className="text-gradient-heat font-semibold">{formatLargeNumber(snap.volume24hUsd)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Whale Radar - only show if we have entries */}
      {whaleRadar.length > 0 && (
        <div className="mb-8 neon-card neon-hover p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gradient-pink">Whale Radar</h3>
            <span className="pill-neon text-xs text-akari-muted bg-akari-cardSoft/50 border border-akari-neon-teal/20 px-3 py-1 font-medium">{whaleRadar.length} entries (24h)</span>
          </div>
          <div className="space-y-2">
            {whaleRadar.slice(0, 5).map((whale, i) => {
              const isAccum = whale.side === 'Accumulating';
              return (
                <div key={`whale-${whale.id}-${i}`} className="flex items-center justify-between text-sm p-3 rounded-xl bg-akari-cardSoft/50 border border-akari-neon-teal/10 transition-all duration-300 hover:border-akari-neon-teal/30 hover:bg-akari-cardSoft/70">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-akari-muted w-10">{timeAgo(whale.occurredAt)}</span>
                    <span className="text-lg">{chainIcon(whale.chain)}</span>
                    <span className="text-akari-text font-semibold uppercase">{whale.tokenSymbol}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`pill-neon px-2.5 py-1 text-[10px] font-semibold border ${isAccum ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'}`}>
                      {isAccum ? 'BUY' : 'SELL'}
                    </span>
                    <span className="text-akari-text font-semibold">{formatLargeNumber(whale.sizeUsd)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chain Flow - only show if we have flows */}
      {chainFlows.length > 0 && (
        <div className="mb-8 neon-card neon-hover p-5">
          <h3 className="text-sm font-bold text-gradient-teal mb-4">Chain Activity</h3>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
            {chainFlows.slice(0, 6).map((flow, i) => {
              const isPositive = flow.netFlow24hUsd >= 0;
              return (
                <div key={`flow-${flow.chain}-${i}`} className={`p-4 rounded-xl border transition-all duration-300 ${isPositive ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{chainIcon(flow.chain)}</span>
                    <span className="text-sm text-akari-text font-semibold capitalize">{flow.chain}</span>
                  </div>
                  <span className={`text-sm font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {isPositive ? '+' : ''}{formatLargeNumber(flow.netFlow24hUsd)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trending Markets Table */}
      {trending.length > 0 && (
        <div className="mb-8">
          <h3 className="text-base font-bold text-gradient-teal mb-4">Top Markets</h3>
          {/* Desktop */}
          <div className="hidden md:block rounded-2xl border border-akari-neon-teal/20 bg-gradient-to-br from-akari-card/80 to-akari-cardSoft/60 backdrop-blur-xl overflow-hidden shadow-[0_0_30px_rgba(0,246,162,0.1)]">
            <table className="w-full text-sm">
              <thead className="border-b border-akari-neon-teal/20 bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5">
                <tr>
                  <th className="text-left px-5 py-4 font-semibold text-gradient-teal">Token</th>
                  <th className="text-right px-5 py-4 font-semibold text-akari-muted">Price</th>
                  <th className="text-right px-5 py-4 font-semibold text-gradient-followers">24h Vol</th>
                  <th className="text-right px-5 py-4 font-semibold text-gradient-pink">24h %</th>
                </tr>
              </thead>
              <tbody>
                {trending.slice(0, 10).map((coin) => {
                  const changeColor = (coin.change24hPct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400';
                  return (
                    <tr key={coin.id} className="border-b border-akari-neon-teal/10 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-neon-teal flex items-center justify-center text-black text-xs font-bold shadow-neon-teal">
                            {coin.symbol.charAt(0)}
                          </div>
                          <div>
                            <span className="text-akari-text font-semibold">{coin.name}</span>
                            <span className="text-akari-muted ml-2 text-xs">{coin.symbol}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right text-akari-text font-medium">{formatPrice(coin.priceUsd)}</td>
                      <td className="px-5 py-4 text-right text-gradient-followers font-semibold">{formatLargeNumber(coin.volume24hUsd)}</td>
                      <td className={`px-5 py-4 text-right font-semibold ${changeColor}`}>
                        {coin.change24hPct !== null ? `${coin.change24hPct >= 0 ? '+' : ''}${coin.change24hPct.toFixed(2)}%` : 'N/A'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {trending.slice(0, 8).map((coin) => {
              const changeColor = (coin.change24hPct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400';
              return (
                <div key={coin.id} className="neon-card neon-hover p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-neon-teal flex items-center justify-center text-black text-xs font-bold shadow-neon-teal">
                        {coin.symbol.charAt(0)}
                      </div>
                      <div>
                        <span className="text-sm text-akari-text font-semibold">{coin.symbol}</span>
                        <span className="text-xs text-akari-muted block">{formatPrice(coin.priceUsd)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-semibold ${changeColor}`}>
                        {coin.change24hPct !== null ? `${coin.change24hPct >= 0 ? '+' : ''}${coin.change24hPct.toFixed(1)}%` : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom row: Trending + Meme preview - only show cards with data */}
      {(trendingMarkets.length > 0 || memePreview.length > 0) && (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2">
          {/* Top Movers */}
          {trendingMarkets.length > 0 && (
            <div className="neon-card neon-hover p-5">
              <h3 className="text-sm font-bold text-gradient-teal uppercase tracking-wider mb-4">Top Movers</h3>
              <div className="space-y-2">
                {trendingMarkets.slice(0, 5).map((m, i) => {
                  const color = m.change24hPct >= 0 ? 'text-green-400' : 'text-red-400';
                  return (
                    <div key={`trend-${m.symbol}-${i}`} className="flex items-center justify-between text-sm p-2 rounded-xl bg-akari-cardSoft/50 border border-akari-neon-teal/10">
                      <span className="text-akari-text font-medium">{m.symbol}</span>
                      <span className={`font-semibold ${color}`}>
                        {m.change24hPct >= 0 ? '+' : ''}{m.change24hPct.toFixed(2)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Meme Preview */}
          {memePreview.length > 0 && (
            <div className="neon-card neon-hover p-5 border-2 border-akari-neon-violet/50">
              <h3 className="text-sm font-bold text-gradient-pink uppercase tracking-wider mb-4">Meme Radar</h3>
              <div className="space-y-2">
                {memePreview.map((m, i) => (
                  <div key={`meme-${m.symbol}-${i}`} className="flex items-center justify-between text-sm p-2 rounded-xl bg-akari-cardSoft/50 border border-akari-neon-teal/10">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{chainIcon(m.chain)}</span>
                      <span className="text-akari-text font-semibold uppercase">{m.symbol}</span>
                    </div>
                    <span className="text-gradient-followers font-semibold">{formatLargeNumber(m.volume24hUsd)}</span>
                  </div>
                ))}
              </div>
              <Link href="/portal/memes" className="block text-xs text-gradient-teal hover:text-akari-neon-teal mt-4 font-semibold transition-all duration-300">
                View full Meme Radar →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* No data state */}
      {!hasMarketData && (
        <div className="text-center py-8">
          <p className="text-sm text-akari-muted">No market data available yet.</p>
        </div>
      )}
    </PortalLayout>
  );
}

// ============ DATA FETCHING ============
export const getServerSideProps: GetServerSideProps<MarketsPageProps> = async () => {
  try {
    const [
      marketSnapshots,
      trackedMetrics,
      chainFlowsRaw,
      whaleRadarRaw,
      trendingMarketsRaw,
      memeRadarResult,
      topDexSnapshots,
      latestCexSnapshots,
    ] = await Promise.all([
      getLatestMarketSnapshots(20).catch(() => []),
      getTrackedMarketMetrics(prisma).catch(() => ({ totalMarketCapUsd: null, totalVolume24hUsd: null })),
      getEnhancedChainFlowRadar(6).catch(() => ({ flows: [], source: 'none' as const })),
      getWhaleRadar(10, 24).catch(() => []),
      getTrendingMarkets(6).catch(() => []),
      getMemeRadarSnapshot(5).catch(() => ({ memes: [], source: 'none' as const, lastUpdated: null })),
      getLatestDexSnapshots(30).catch(() => []),
      getLatestCexSnapshots(30).catch(() => []),
    ]);

    // Dedupe DEX by symbol (highest liquidity wins)
    const dexMap = new Map<string, DexSnapshotDto>();
    for (const d of topDexSnapshots as DexMarketSnapshot[]) {
      if (!d.symbol) continue;
      const existing = dexMap.get(d.symbol);
      if (!existing || (d.liquidityUsd || 0) > (existing.liquidityUsd || 0)) {
        dexMap.set(d.symbol, {
          symbol: d.symbol,
          name: d.name,
          chain: d.chain,
          dex: d.dex,
          liquidityUsd: d.liquidityUsd,
          volume24hUsd: d.volume24hUsd,
          priceUsd: d.priceUsd,
        });
      }
    }
    const dexRadar = Array.from(dexMap.values())
      .sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0))
      .slice(0, 8);

    // Dedupe CEX by symbol (highest volume wins)
    const cexMap = new Map<string, CexSnapshotDto>();
    for (const c of latestCexSnapshots as CexMarketSnapshot[]) {
      if (!c.symbol) continue;
      const existing = cexMap.get(c.symbol);
      if (!existing || (c.volume24hUsd || 0) > (existing.volume24hUsd || 0)) {
        cexMap.set(c.symbol, {
          symbol: c.symbol,
          baseAsset: c.baseAsset,
          quoteAsset: c.quoteAsset,
          source: c.source,
          priceUsd: c.priceUsd,
          volume24hUsd: c.volume24hUsd,
        });
      }
    }
    const cexHeatmap = Array.from(cexMap.values())
      .sort((a, b) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0))
      .slice(0, 8);

    // Market snapshots
    const trending: MarketSnapshotDto[] = (marketSnapshots as MarketSnapshot[]).map(s => ({
      id: s.id,
      symbol: s.symbol,
      name: s.name,
      priceUsd: s.priceUsd,
      volume24hUsd: s.volume24hUsd,
      change24hPct: s.change24hPct,
    }));

    // Chain flows
    const chainFlows: ChainFlowDto[] = chainFlowsRaw.flows.map((f: ChainFlowRow) => ({
      chain: f.chain,
      netFlow24hUsd: f.netFlow24hUsd,
      signalLabel: f.signalLabel,
    }));

    // Whale radar
    const whaleRadar: WhaleRadarDto[] = (whaleRadarRaw as WhaleRadarRow[]).map(w => ({
      id: w.id,
      occurredAt: w.occurredAt.toISOString(),
      chain: w.chain,
      tokenSymbol: w.tokenSymbol,
      side: w.side,
      sizeUsd: w.sizeUsd,
    }));

    // Trending markets
    const trendingMarkets: TrendingMarketDto[] = (trendingMarketsRaw as TrendingMarketRow[]).map(t => ({
      symbol: t.symbol,
      name: t.name,
      change24hPct: t.change24hPct,
    }));

    // Meme preview (filter out majors again to be safe)
    const memePreview: MemePreviewDto[] = memeRadarResult.memes
      .filter((m: MemeRadarRow) => !isMajorToken(m.symbol, m.name))
      .slice(0, 3)
      .map((m: MemeRadarRow) => ({
        symbol: m.symbol,
        chain: m.chain,
        volume24hUsd: m.volume24hUsd,
      }));

    // Find last updated
    let lastUpdated: string | null = null;
    if (marketSnapshots.length > 0) {
      lastUpdated = (marketSnapshots[0] as MarketSnapshot).createdAt.toISOString();
    }

    return {
      props: {
        trackedMarketCap: formatMetricValue(trackedMetrics.totalMarketCapUsd),
        trackedVolume24h: formatMetricValue(trackedMetrics.totalVolume24hUsd),
        trending,
        dexRadar,
        cexHeatmap,
        chainFlows,
        whaleRadar,
        trendingMarkets,
        memePreview,
        lastUpdated,
      },
    };
  } catch (error) {
    console.error('[Markets Page] Error:', error);
    return {
      props: {
        trackedMarketCap: 'N/A',
        trackedVolume24h: 'N/A',
        trending: [],
        dexRadar: [],
        cexHeatmap: [],
        chainFlows: [],
        whaleRadar: [],
        trendingMarkets: [],
        memePreview: [],
        lastUpdated: null,
        error: 'Failed to load market data',
      },
    };
  }
};
