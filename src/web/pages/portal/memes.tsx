import React from 'react';
import { GetServerSideProps } from 'next';
import { PortalLayout } from '../../components/portal/PortalLayout';
import { getLatestMemeTokenSnapshots, getDexSnapshotsForSymbols } from '../../lib/portal/db';
import type { MemeTokenSnapshot, DexMarketSnapshot } from '@prisma/client';

// Serializable version of MemeTokenSnapshot for SSR props
interface MemeSnapshotDto {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  marketCapUsd: number | null;
  change24hPct: number | null;
  source: string;
  createdAt: string;
}

// DEX info per meme
interface MemeDexInfo {
  symbol: string;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  chain: string | null;
  dexName: string | null;
}

interface MemesPageProps {
  memecoins: MemeSnapshotDto[];
  memeDexInfo: MemeDexInfo[];
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

function formatLargeNumber(num: number): string {
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
    return { text: 'N/A', color: 'text-akari-muted' };
  }
  
  const sign = change >= 0 ? '+' : '';
  const color = change >= 0 ? 'text-green-400' : 'text-red-400';
  return {
    text: `${sign}${change.toFixed(2)}%`,
    color,
  };
}

export default function MemesPage({ memecoins, memeDexInfo, error }: MemesPageProps) {
  // Create lookup map for DEX info by symbol
  const dexBySymbol = React.useMemo(() => {
    const map = new Map<string, MemeDexInfo>();
    for (const info of memeDexInfo) {
      map.set(info.symbol.toUpperCase(), info);
    }
    return map;
  }, [memeDexInfo]);

  // Sort by liquidityUsd (from DEX) descending, then by marketCapUsd
  const sortedMemecoins = React.useMemo(() => {
    return [...memecoins].sort((a, b) => {
      const dexA = dexBySymbol.get(a.symbol.toUpperCase());
      const dexB = dexBySymbol.get(b.symbol.toUpperCase());
      
      // First sort by DEX liquidity
      const liqA = dexA?.liquidityUsd ?? 0;
      const liqB = dexB?.liquidityUsd ?? 0;
      if (liqA !== liqB) return liqB - liqA;
      
      // Then by market cap
      if (a.marketCapUsd !== null && b.marketCapUsd !== null) {
        return b.marketCapUsd - a.marketCapUsd;
      }
      if (a.marketCapUsd !== null) return -1;
      if (b.marketCapUsd !== null) return 1;
      return b.priceUsd - a.priceUsd;
    });
  }, [memecoins, dexBySymbol]);

  // Top 5 by DEX liquidity for candidates section
  const topByLiquidity = React.useMemo(() => {
    return sortedMemecoins
      .filter(m => {
        const dex = dexBySymbol.get(m.symbol.toUpperCase());
        return dex && dex.liquidityUsd && dex.liquidityUsd > 0;
      })
      .slice(0, 5);
  }, [sortedMemecoins, dexBySymbol]);

  // Top 3 by priceChange24h for "High attention" candidates
  const topByChange = [...memecoins]
    .filter((m) => m.change24hPct !== null)
    .sort((a, b) => {
      const changeA = a.change24hPct ?? 0;
      const changeB = b.change24hPct ?? 0;
      return changeB - changeA;
    })
    .slice(0, 3);

  // First 10 memecoins for the SOL tracker table
  const solTrackerMemes = sortedMemecoins.slice(0, 10);

  return (
    <PortalLayout title="Meme Radar">
      <section className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold mb-2 text-akari-text">Meme Radar</h1>
        <p className="text-xs sm:text-sm text-akari-muted max-w-2xl">
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
            <span className="text-xs text-akari-muted">Sorted by DEX liquidity</span>
          </div>
          
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {sortedMemecoins.map((coin) => {
              const priceChange = formatPriceChange(coin.change24hPct);
              const dexInfo = dexBySymbol.get(coin.symbol.toUpperCase());
              
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
                    <div className="flex flex-col items-end gap-1">
                      {dexInfo?.liquidityUsd && dexInfo.liquidityUsd > 100_000 && (
                        <span className="inline-flex items-center rounded-full bg-green-500/15 px-2 py-0.5 text-[9px] font-medium text-green-400 uppercase tracking-[0.1em]">
                          High Liq
                        </span>
                      )}
                      {coin.marketCapUsd !== null && coin.marketCapUsd > 10_000_000 && (
                        <span className="inline-flex items-center rounded-full bg-akari-primary/15 px-2 py-0.5 text-[9px] font-medium text-akari-primary uppercase tracking-[0.1em]">
                          High MC
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-akari-muted">Price</span>
                      <span className="text-sm font-semibold text-akari-primary">{formatPrice(coin.priceUsd)}</span>
                    </div>
                    
                    {/* DEX Liquidity */}
                    {dexInfo?.liquidityUsd && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-akari-muted">DEX Liquidity</span>
                        <span className="text-xs font-medium text-green-400">{formatLargeNumber(dexInfo.liquidityUsd)}</span>
                      </div>
                    )}

                    {/* DEX Volume */}
                    {dexInfo?.volume24hUsd && dexInfo.volume24hUsd > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-akari-muted">DEX Vol 24h</span>
                        <span className="text-xs font-medium text-akari-text">{formatLargeNumber(dexInfo.volume24hUsd)}</span>
                      </div>
                    )}
                    
                    {coin.marketCapUsd !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-akari-muted">Market Cap</span>
                        <span className="text-xs font-medium text-akari-text">{formatMarketCap(coin.marketCapUsd)}</span>
                      </div>
                    )}
                    
                    {coin.change24hPct !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-akari-muted">24h Change</span>
                        <span className={`text-xs font-medium ${priceChange.color}`}>{priceChange.text}</span>
                      </div>
                    )}

                    {/* Chain/DEX info */}
                    {dexInfo?.dexName && (
                      <div className="pt-2 border-t border-akari-border/20">
                        <span className="text-[10px] text-akari-muted">
                          {dexInfo.chain ? `${dexInfo.chain} • ` : ''}{dexInfo.dexName}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State - when no snapshots */}
      {!error && sortedMemecoins.length === 0 && (
        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-6 mb-6">
          <p className="text-sm text-akari-muted text-center">
            No meme data yet. Waiting for first snapshot from cron.
          </p>
        </div>
      )}

      {/* Info Cards with Live Data */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        {/* SOL Memecoins Tracker */}
        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-4 hover:border-akari-primary/40 transition">
          <p className="text-xs text-akari-primary mb-1 uppercase tracking-[0.1em]">SOL memecoins tracker</p>
          <p className="text-sm mb-1 text-akari-text font-medium">Solana Memes</p>
          <p className="text-[11px] text-akari-muted mb-3">
            Track SOL memes by DEX liquidity. Filter by liquidity threshold, age, holder count, and velocity.
          </p>
          
          {!error && solTrackerMemes.length > 0 ? (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {solTrackerMemes.map((coin) => {
                const change = formatPriceChange(coin.change24hPct);
                const dexInfo = dexBySymbol.get(coin.symbol.toUpperCase());
                return (
                  <div key={coin.id} className="flex items-center justify-between text-xs py-1 border-b border-akari-border/20 last:border-0">
                    <div className="flex-1">
                      <span className="text-akari-text uppercase font-medium">{coin.symbol}</span>
                      {dexInfo?.liquidityUsd && (
                        <span className="text-green-400 ml-2 text-[10px]">{formatLargeNumber(dexInfo.liquidityUsd)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-akari-primary">{formatPrice(coin.priceUsd)}</span>
                      {coin.change24hPct !== null && (
                        <span className={`text-[10px] font-medium ${change.color}`}>{change.text}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-akari-muted">No meme data available</p>
          )}
        </div>

        {/* AI Memes vs Pure Degen */}
        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-4 hover:border-akari-primary/40 transition">
          <p className="text-xs text-akari-accent mb-1 uppercase tracking-[0.1em]">AI memes vs pure degen</p>
          <p className="text-sm mb-1 text-akari-text font-medium">Narrative Separation</p>
          <p className="text-[11px] text-akari-muted mb-3">
            Separate memes by narrative. AI-powered memes vs pure degen plays. Track which narrative performs better.
          </p>
          
          {!error && topByChange.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[10px] text-akari-muted uppercase tracking-[0.1em] mb-2">High attention</p>
              {topByChange.map((coin) => {
                const change = formatPriceChange(coin.change24hPct);
                return (
                  <div key={coin.id} className="flex items-center justify-between text-xs">
                    <span className="text-akari-text uppercase">{coin.symbol}</span>
                    <span className={`font-medium ${change.color}`}>{change.text}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-akari-muted">No data available</p>
          )}
        </div>

        {/* Watchlist / Candidates - Now sorted by DEX liquidity */}
        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-4 hover:border-akari-primary/40 transition">
          <p className="text-xs text-akari-profit mb-1 uppercase tracking-[0.1em]">Watchlist / candidates</p>
          <p className="text-sm mb-1 text-akari-text font-medium">Prediction Candidates</p>
          <p className="text-[11px] text-akari-muted mb-3">
            Top memes by DEX liquidity. These candidates can become new prediction pools with one tap.
          </p>
          
          {!error && topByLiquidity.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[10px] text-akari-muted uppercase tracking-[0.1em] mb-2">By Liquidity</p>
              {topByLiquidity.map((coin) => {
                const dexInfo = dexBySymbol.get(coin.symbol.toUpperCase());
                return (
                  <div key={coin.id} className="flex items-center justify-between text-xs">
                    <span className="text-akari-text">{coin.name}</span>
                    <span className="font-medium text-green-400">
                      {dexInfo?.liquidityUsd ? formatLargeNumber(dexInfo.liquidityUsd) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : !error && topByChange.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[10px] text-akari-muted uppercase tracking-[0.1em] mb-2">Top movers</p>
              {topByChange.map((coin) => {
                const change = formatPriceChange(coin.change24hPct);
                return (
                  <div key={coin.id} className="flex items-center justify-between text-xs">
                    <span className="text-akari-text">{coin.name}</span>
                    <span className={`font-medium ${change.color}`}>{change.text}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-akari-muted">No candidates available</p>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}

export const getServerSideProps: GetServerSideProps<MemesPageProps> = async () => {
  try {
    const memeSnapshots = await getLatestMemeTokenSnapshots(30);
    
    // Map to serializable DTOs
    const memecoins: MemeSnapshotDto[] = memeSnapshots.map((s: MemeTokenSnapshot) => ({
      id: s.id,
      symbol: s.symbol,
      name: s.name,
      priceUsd: s.priceUsd,
      marketCapUsd: s.marketCapUsd,
      change24hPct: s.change24hPct,
      source: s.source,
      createdAt: s.createdAt.toISOString(),
    }));

    // Fetch DEX info for meme symbols
    const symbols = memeSnapshots.map((s: MemeTokenSnapshot) => s.symbol);
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
        (d: DexMarketSnapshot) => d.symbol.toUpperCase() === upperSymbol
      );
      
      if (dexForSymbol.length === 0) {
        memeDexInfo.push({
          symbol: upperSymbol,
          liquidityUsd: null,
          volume24hUsd: null,
          chain: null,
          dexName: null,
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
        dexName: best.dexName,
      });
    }

    return {
      props: {
        memecoins: JSON.parse(JSON.stringify(memecoins)),
        memeDexInfo: JSON.parse(JSON.stringify(memeDexInfo)),
      },
    };
  } catch (error: any) {
    console.error('[Memes Page] Error fetching memecoins:', error);
    return {
      props: {
        memecoins: [],
        memeDexInfo: [],
        error: 'Failed to load meme radar',
      },
    };
  }
};
