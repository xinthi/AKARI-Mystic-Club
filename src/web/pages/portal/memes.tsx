import React from 'react';
import { GetServerSideProps } from 'next';
import { PortalLayout } from '../../components/portal/PortalLayout';
import { 
  getMemeRadarSnapshot,
  getDexSnapshotsForSymbols,
  MEME_EXCLUDED_SYMBOLS,
  isMemeToken,
  type MemeRadarRow,
  type DexLiquidityRow,
} from '../../lib/portal/db';
import type { DexMarketSnapshot } from '@prisma/client';
import { chainIcon, formatChainLabel, chainBadgeColor } from '../../lib/portal/chains';

// DEX info per meme
interface MemeDexInfo {
  symbol: string;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  chain: string | null;
  dex: string | null;
}

interface MemesPageProps {
  memes: MemeRadarRow[];
  memeDexInfo: MemeDexInfo[];
  dataSource: 'meme_snapshots' | 'dex_fallback' | 'none';
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

function formatLargeNumber(num: number | null): string {
  if (num === null) return '—';
  if (num >= 1_000_000_000) {
    return `$${(num / 1_000_000_000).toFixed(2)}B`;
  } else if (num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(2)}M`;
  } else if (num >= 1_000) {
    return `$${(num / 1_000).toFixed(2)}K`;
  }
  return `$${num.toFixed(2)}`;
}

function formatPriceChange(change: number | null): { text: string; color: string } {
  if (change === null) {
    return { text: '—', color: 'text-akari-muted' };
  }
  
  const sign = change >= 0 ? '+' : '';
  const color = change >= 0 ? 'text-green-400' : 'text-red-400';
  return {
    text: `${sign}${change.toFixed(2)}%`,
    color,
  };
}

function timeAgo(date: string | Date): string {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function MemesPage({ memes, memeDexInfo, dataSource, lastUpdated, error }: MemesPageProps) {
  // Create lookup map for DEX info by symbol
  const dexBySymbol = React.useMemo(() => {
    const map = new Map<string, MemeDexInfo>();
    for (const info of memeDexInfo) {
      map.set(info.symbol.toUpperCase(), info);
    }
    return map;
  }, [memeDexInfo]);

  // Sort by volume then liquidity
  const sortedMemes = React.useMemo(() => {
    return [...memes].sort((a, b) => {
      // First by volume
      const volA = a.volume24hUsd ?? 0;
      const volB = b.volume24hUsd ?? 0;
      if (volA !== volB) return volB - volA;
      
      // Then by DEX liquidity
      const dexA = dexBySymbol.get(a.symbol.toUpperCase());
      const dexB = dexBySymbol.get(b.symbol.toUpperCase());
      const liqA = dexA?.liquidityUsd ?? 0;
      const liqB = dexB?.liquidityUsd ?? 0;
      return liqB - liqA;
    });
  }, [memes, dexBySymbol]);

  // Top 5 by DEX liquidity for candidates section
  const topByLiquidity = React.useMemo(() => {
    return sortedMemes
      .filter(m => {
        const dex = dexBySymbol.get(m.symbol.toUpperCase());
        return dex && dex.liquidityUsd && dex.liquidityUsd > 0;
      })
      .slice(0, 5);
  }, [sortedMemes, dexBySymbol]);

  // Top by priceChange24h for "High attention" candidates
  const topByChange = [...memes]
    .filter((m) => m.change24hPct !== null)
    .sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0))
    .slice(0, 4);

  // First 10 memes for the tracker table
  const trackerMemes = sortedMemes.slice(0, 10);

  // Data source subtitle
  const dataSourceText = dataSource === 'meme_snapshots'
    ? 'Live meme snapshot from CoinGecko & DEXs.'
    : dataSource === 'dex_fallback'
    ? 'MemeTokenSnapshot is warming up — showing DEX data as fallback.'
    : 'Waiting for first snapshot.';

  return (
    <PortalLayout title="Meme Radar">
      <section className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
          <h1 className="text-xl sm:text-2xl font-semibold text-akari-text">Meme Radar</h1>
          {lastUpdated && (
            <span className="text-[10px] text-akari-muted bg-akari-cardSoft px-2 py-1 rounded-full">
              Updated {timeAgo(lastUpdated)}
            </span>
          )}
        </div>
        <p className="text-xs sm:text-sm text-akari-muted max-w-2xl">
          Track onchain meme pairs, liquidity and velocity. Majors (BTC, ETH, SOL) are filtered out — only meme tokens appear here.
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

      {/* Main Meme Table */}
      {!error && sortedMemes.length > 0 && (
        <div className="mb-6">
          <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-akari-text">Top Meme Tokens by DEX Volume</h2>
                <p className="text-[10px] sm:text-xs text-akari-muted">{dataSourceText}</p>
              </div>
              <span className="inline-flex items-center self-start sm:self-auto rounded-full bg-purple-500/15 px-2 py-1 text-[10px] font-medium text-purple-400 uppercase tracking-[0.1em]">
                {sortedMemes.length} Memes
              </span>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-akari-muted border-b border-akari-border/30">
                    <th className="text-left py-2 font-medium">Token</th>
                    <th className="text-left py-2 font-medium">Chain</th>
                    <th className="text-right py-2 font-medium">Price</th>
                    <th className="text-right py-2 font-medium">24h Vol</th>
                    <th className="text-right py-2 font-medium">24h Change</th>
                    <th className="text-right py-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMemes.map((meme, idx) => {
                    const change = formatPriceChange(meme.change24hPct);
                    const dexInfo = dexBySymbol.get(meme.symbol.toUpperCase());
                    return (
                      <tr key={`${meme.symbol}-${idx}`} className="border-b border-akari-border/10 hover:bg-akari-cardSoft/30">
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{chainIcon(meme.chain || dexInfo?.chain)}</span>
                            <div>
                              <span className="font-medium text-akari-text uppercase">{meme.symbol}</span>
                              <span className="text-akari-muted ml-1.5 hidden lg:inline">{meme.name}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${chainBadgeColor(meme.chain || dexInfo?.chain)}`}>
                            {formatChainLabel(meme.chain || dexInfo?.chain)}
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-akari-text">
                          {meme.priceUsd ? formatPrice(meme.priceUsd) : '—'}
                        </td>
                        <td className="py-2.5 text-right text-purple-400 font-medium">
                          {formatLargeNumber(meme.volume24hUsd)}
                        </td>
                        <td className={`py-2.5 text-right font-medium ${change.color}`}>
                          {change.text}
                        </td>
                        <td className="py-2.5 text-right">
                          <span className="px-1.5 py-0.5 rounded bg-akari-cardSoft text-akari-muted text-[10px]">
                            {meme.source}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2">
              {sortedMemes.map((meme, idx) => {
                const change = formatPriceChange(meme.change24hPct);
                const dexInfo = dexBySymbol.get(meme.symbol.toUpperCase());
                return (
                  <div 
                    key={`${meme.symbol}-${idx}`}
                    className="flex items-center justify-between p-3 rounded-xl bg-akari-cardSoft/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{chainIcon(meme.chain || dexInfo?.chain)}</span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-akari-text uppercase text-sm">{meme.symbol}</span>
                          <span className={`px-1 py-0.5 rounded text-[9px] ${chainBadgeColor(meme.chain || dexInfo?.chain)}`}>
                            {formatChainLabel(meme.chain || dexInfo?.chain)}
                          </span>
                        </div>
                        <span className="text-[10px] text-akari-muted">{meme.name}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-akari-text">
                        {meme.priceUsd ? formatPrice(meme.priceUsd) : '—'}
                      </div>
                      <div className="flex items-center gap-1.5 justify-end mt-0.5">
                        <span className="text-[10px] text-purple-400">
                          {formatLargeNumber(meme.volume24hUsd)}
                        </span>
                        <span className={`text-[10px] font-medium ${change.color}`}>
                          {change.text}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Complete Empty State */}
      {!error && sortedMemes.length === 0 && (
        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-6 mb-6 text-center">
          <p className="text-sm text-akari-text mb-2 font-medium">
            No meme tokens cleared our filters in the last 24h.
          </p>
          <p className="text-xs text-akari-muted mb-3">
            The radar hides majors like ETH/SOL/BTC and only shows true memecoins once liquidity builds up.
            We require tokens to match meme keywords (pepe, bonk, wif, doge, etc.) to appear here.
          </p>
          <p className="text-[10px] text-akari-muted">
            Data sources: CoinGecko, DexScreener, GeckoTerminal · Updated every few minutes
          </p>
        </div>
      )}

      {/* Bottom Info Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        {/* Solana Memes */}
        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-4 hover:border-akari-primary/40 transition">
          <p className="text-xs text-akari-primary mb-1 uppercase tracking-[0.1em]">Solana Memes</p>
          <p className="text-sm mb-1 text-akari-text font-medium">SOL Meme Tracker</p>
          <p className="text-[11px] text-akari-muted mb-3">
            Track SOL memes by DEX liquidity. Data from Dexscreener &amp; GeckoTerminal.
          </p>
          
          {!error && trackerMemes.length > 0 ? (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {trackerMemes.filter(m => (m.chain || '').toLowerCase().includes('sol')).slice(0, 6).map((meme, idx) => {
                const change = formatPriceChange(meme.change24hPct);
                const dexInfo = dexBySymbol.get(meme.symbol.toUpperCase());
                return (
                  <div key={`${meme.symbol}-sol-${idx}`} className="flex items-center justify-between text-xs py-1 border-b border-akari-border/20 last:border-0">
                    <div className="flex-1 flex items-center gap-1">
                      <span className="text-sm">{chainIcon('solana')}</span>
                      <span className="text-akari-text uppercase font-medium">{meme.symbol}</span>
                      {dexInfo?.liquidityUsd && (
                        <span className="text-green-400 text-[10px]">{formatLargeNumber(dexInfo.liquidityUsd)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-akari-primary">{meme.priceUsd ? formatPrice(meme.priceUsd) : '—'}</span>
                      <span className={`text-[10px] font-medium ${change.color}`}>{change.text}</span>
                    </div>
                  </div>
                );
              })}
              {trackerMemes.filter(m => (m.chain || '').toLowerCase().includes('sol')).length === 0 && (
                <p className="text-[10px] text-akari-muted">No Solana memes in current dataset.</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-akari-muted">
              SOL meme data warming up. DEX cron collecting first snapshots.
            </p>
          )}
        </div>

        {/* AI Memes vs Pure Degen */}
        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-4 hover:border-akari-primary/40 transition">
          <p className="text-xs text-akari-accent mb-1 uppercase tracking-[0.1em]">AI Memes vs Pure Degen</p>
          <p className="text-sm mb-1 text-akari-text font-medium">Narrative Separation</p>
          <p className="text-[11px] text-akari-muted mb-3">
            We&apos;ll separate AI memes (GOAT, ACT, etc.) from pure degen plays once AI tagging is added. Track which narrative performs better over time.
          </p>
          
          {!error && topByChange.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[10px] text-akari-muted uppercase tracking-[0.1em] mb-2">High attention</p>
              {topByChange.map((meme, idx) => {
                const change = formatPriceChange(meme.change24hPct);
                return (
                  <div key={`${meme.symbol}-change-${idx}`} className="flex items-center justify-between text-xs">
                    <span className="text-akari-text uppercase">{meme.symbol}</span>
                    <span className={`font-medium ${change.color}`}>{change.text}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-akari-muted">
              Will surface top movers once meme data syncs.
            </p>
          )}
        </div>

        {/* Prediction Candidates */}
        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-4 hover:border-akari-primary/40 transition">
          <p className="text-xs text-akari-profit mb-1 uppercase tracking-[0.1em]">Prediction Candidates</p>
          <p className="text-sm mb-1 text-akari-text font-medium">Watchlist</p>
          <p className="text-[11px] text-akari-muted mb-3">
            Top memes by DEX liquidity. When a token graduates into this list, it&apos;s a candidate for new prediction markets in the MiniApp.
          </p>
          
          {!error && topByLiquidity.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[10px] text-akari-muted uppercase tracking-[0.1em] mb-2">By Liquidity</p>
              {topByLiquidity.map((meme, idx) => {
                const dexInfo = dexBySymbol.get(meme.symbol.toUpperCase());
                return (
                  <div key={`${meme.symbol}-liq-${idx}`} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-sm">{chainIcon(meme.chain || dexInfo?.chain)}</span>
                      <span className="text-akari-text">{meme.name}</span>
                    </div>
                    <span className="font-medium text-green-400">
                      {dexInfo?.liquidityUsd ? formatLargeNumber(dexInfo.liquidityUsd) : formatLargeNumber(meme.volume24hUsd)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-akari-muted">
              Prediction candidates ranked by DEX liquidity will appear here.
            </p>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}

export const getServerSideProps: GetServerSideProps<MemesPageProps> = async () => {
  try {
    // Get meme radar snapshot using the new helper
    const { memes, source: dataSource, lastUpdated } = await getMemeRadarSnapshot(20);

    // For memes that came from MemeTokenSnapshot, fetch additional DEX info
    const symbols = memes.map(m => m.symbol);
    let dexSnapshots: DexMarketSnapshot[] = [];
    
    if (symbols.length > 0) {
      dexSnapshots = await getDexSnapshotsForSymbols(symbols).catch(() => []);
    }

    // Aggregate DEX info per symbol (take best liquidity)
    const memeDexInfo: MemeDexInfo[] = [];
    const processedSymbols = new Set<string>();
    
    for (const symbol of symbols) {
      const upperSymbol = symbol.toUpperCase();
      if (processedSymbols.has(upperSymbol)) continue;
      processedSymbols.add(upperSymbol);
      
      const dexForSymbol = dexSnapshots.filter(
        (d: DexMarketSnapshot) => d.symbol?.toUpperCase() === upperSymbol
      );
      
      if (dexForSymbol.length === 0) {
        // Use data from memes array if available
        const meme = memes.find(m => m.symbol.toUpperCase() === upperSymbol);
        memeDexInfo.push({
          symbol: upperSymbol,
          liquidityUsd: null,
          volume24hUsd: meme?.volume24hUsd ?? null,
          chain: meme?.chain ?? null,
          dex: meme?.source ?? null,
        });
        continue;
      }
      
      // Find the one with highest liquidity
      const best = dexForSymbol.reduce((prev: DexMarketSnapshot, curr: DexMarketSnapshot) => {
        const prevLiq = prev.liquidityUsd || 0;
        const currLiq = curr.liquidityUsd || 0;
        return currLiq > prevLiq ? curr : prev;
      });
      
      memeDexInfo.push({
        symbol: upperSymbol,
        liquidityUsd: best.liquidityUsd,
        volume24hUsd: best.volume24hUsd,
        chain: best.chain,
        dex: best.dex ?? best.source,
      });
    }

    // Serialize memes (convert Date objects to strings)
    const serializedMemes = memes.map(m => ({
      ...m,
      lastUpdated: m.lastUpdated.toISOString(),
    }));

    return {
      props: {
        memes: JSON.parse(JSON.stringify(serializedMemes)),
        memeDexInfo: JSON.parse(JSON.stringify(memeDexInfo)),
        dataSource,
        lastUpdated: lastUpdated ? lastUpdated.toISOString() : null,
      },
    };
  } catch (error: unknown) {
    console.error('[Memes Page] Error fetching memecoins:', error);
    return {
      props: {
        memes: [],
        memeDexInfo: [],
        dataSource: 'none',
        lastUpdated: null,
        error: 'Failed to load meme radar',
      },
    };
  }
};
