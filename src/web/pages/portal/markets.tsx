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
} from '../../lib/portal/db';
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

// DEX snapshot DTO for SSR
interface DexSnapshotDto {
  symbol: string;
  chain: string;
  dexSource: string;
  dexName: string | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
}

// CEX snapshot DTO for SSR
interface CexSnapshotDto {
  symbol: string;
  exchange: string;
  pairCode: string;
  volume24hUsd: number | null;
}

// Aggregated trading venue info per symbol
interface TradingVenueInfo {
  symbol: string;
  dexLiquidityUsd: number | null;
  dexVolume24hUsd: number | null;
  dexSources: string[];
  cexExchanges: string[];
}

// Top DEX liquidity entry
interface TopDexEntry {
  symbol: string;
  name: string | null;
  chain: string;
  liquidityUsd: number;
  dexName: string | null;
}

interface MarketsPageProps {
  pulse: MarketPulse | null;
  highlights: AkariHighlights | null;
  trending: MarketSnapshotDto[];
  livePrices: LivePricePreview[]; // Binance fallback when no snapshots
  tradingVenues: TradingVenueInfo[]; // DEX/CEX info per symbol
  topDexLiquidity: TopDexEntry[]; // Top tokens by DEX liquidity
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
  livePrices,
  tradingVenues,
  topDexLiquidity,
  whaleEntriesRecent,
  whaleLastAny,
  narratives,
  volumeLeaders,
  liquiditySignalsRecent,
  liquidityLastAny,
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
                <div key={`${entry.symbol}-${idx}`} className="flex items-center justify-between p-2 bg-akari-cardSoft/50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-[10px] font-bold">
                      {entry.symbol.charAt(0)}
                    </div>
                    <div>
                      <span className="text-xs font-medium text-akari-text uppercase">{entry.symbol}</span>
                      <p className="text-[9px] text-akari-muted">{entry.chain} • {entry.dexName || 'DEX'}</p>
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
                          {venue?.cexExchanges && venue.cexExchanges.map(ex => (
                            <span 
                              key={ex} 
                              className="inline-flex items-center rounded-full bg-blue-500/15 px-2 py-0.5 text-[9px] font-medium text-blue-400 uppercase"
                            >
                              {ex}
                            </span>
                          ))}
                          {(!venue || (venue.dexSources.length === 0 && venue.cexExchanges.length === 0)) && (
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
                      {venue?.cexExchanges && venue.cexExchanges.slice(0, 2).map(ex => (
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
      topDexSnapshots,
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
        (d: DexMarketSnapshot) => d.symbol.toUpperCase() === symbol
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

      tradingVenues.push({
        symbol,
        dexLiquidityUsd: maxDexLiquidity && maxDexLiquidity > 0 ? maxDexLiquidity : null,
        dexVolume24hUsd: totalDexVolume > 0 ? totalDexVolume : null,
        dexSources: [...new Set(dexForSymbol.map((d: DexMarketSnapshot) => d.dexSource))],
        cexExchanges: [...new Set(cexForSymbol.map((c: CexMarketSnapshot) => c.exchange))],
      });
    }

    // Map top DEX liquidity entries
    const topDexLiquidity: TopDexEntry[] = topDexSnapshots
      .filter((d: DexMarketSnapshot) => d.liquidityUsd && d.liquidityUsd > 0)
      .map((d: DexMarketSnapshot) => ({
        symbol: d.symbol,
        name: d.name,
        chain: d.chain,
        liquidityUsd: d.liquidityUsd!,
        dexName: d.dexName,
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
        livePrices: JSON.parse(JSON.stringify(livePrices)),
        tradingVenues: JSON.parse(JSON.stringify(tradingVenues)),
        topDexLiquidity: JSON.parse(JSON.stringify(topDexLiquidity)),
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
        livePrices: [],
        tradingVenues: [],
        topDexLiquidity: [],
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
