import React from 'react';
import { GetServerSideProps } from 'next';
import { PortalLayout } from '../../components/portal/PortalLayout';
import { 
  getMemeRadarSnapshot,
  getDexSnapshotsForSymbols,
  isMajorToken,
  type MemeRadarRow,
} from '../../lib/portal/db';
import type { DexMarketSnapshot } from '@prisma/client';
import { chainIcon, formatChainLabel, chainBadgeColor } from '../../lib/portal/chains';

// Aggregated meme token (grouped by symbol, best pair selected)
interface AggregatedMeme {
  symbol: string;
  name: string;
  chain: string | null;
  priceUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  change24hPct: number | null;
  source: string;
}

interface MemesPageProps {
  memes: AggregatedMeme[];
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
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(price);
}

function formatLargeNumber(num: number | null): string {
  if (num === null || num === 0) return '—';
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

function formatPriceChange(change: number | null): { text: string; color: string } {
  if (change === null) return { text: '—', color: 'text-akari-muted' };
  const sign = change >= 0 ? '+' : '';
  const color = change >= 0 ? 'text-green-400' : 'text-red-400';
  return { text: `${sign}${change.toFixed(2)}%`, color };
}

function timeAgo(date: string | Date): string {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function MemesPage({ memes, lastUpdated, error }: MemesPageProps) {
  // Sort by volume desc, then liquidity desc
  const sortedMemes = React.useMemo(() => {
    return [...memes].sort((a, b) => {
      const volA = a.volume24hUsd ?? 0;
      const volB = b.volume24hUsd ?? 0;
      if (volB !== volA) return volB - volA;
      return (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0);
    });
  }, [memes]);

  // Solana memes only (for side widget)
  const solanaMemes = React.useMemo(() => {
    return sortedMemes.filter(m => 
      m.chain?.toLowerCase().includes('sol') || m.chain?.toLowerCase() === 'solana'
    ).slice(0, 5);
  }, [sortedMemes]);

  // Top 3 by liquidity for prediction candidates
  const topByLiquidity = React.useMemo(() => {
    return sortedMemes
      .filter(m => m.liquidityUsd && m.liquidityUsd > 0)
      .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
      .slice(0, 3);
  }, [sortedMemes]);

  // If no memes at all, show minimal message
  if (error || sortedMemes.length === 0) {
    return (
      <PortalLayout title="Meme Radar">
        <section className="mb-6">
          <h1 className="text-xl sm:text-2xl font-semibold text-akari-text mb-2">Meme Radar</h1>
          <p className="text-xs text-akari-muted">
            {error ? 'Failed to load meme data.' : 'No meme tokens available.'}
          </p>
        </section>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Meme Radar">
      {/* Header */}
      <section className="mb-8">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-gradient-blue">Meme Radar</h1>
            <p className="text-sm text-akari-muted">
              Meme tokens by DEX volume · Majors filtered out
            </p>
          </div>
          {lastUpdated && (
            <span className="pill-neon text-xs text-akari-muted bg-akari-cardSoft/50 border border-akari-neon-teal/20 px-3 py-1.5">
              {timeAgo(lastUpdated)}
            </span>
          )}
        </div>
      </section>

      {/* Main Meme Table */}
      <div className="mb-8">
        <div className="neon-card neon-hover p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-semibold text-gradient-blue">Top Meme Tokens</h2>
            <span className="pill-neon text-xs text-akari-neon-violet bg-akari-neon-violet/15 border border-akari-neon-violet/30 px-3 py-1.5 font-semibold">
              {sortedMemes.length} tokens
            </span>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-akari-neon-teal/20 bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5">
                  <th className="text-left py-4 px-5 font-semibold text-gradient-teal">Token</th>
                  <th className="text-left py-4 px-5 font-semibold text-gradient-blue">Chain</th>
                  <th className="text-right py-4 px-5 font-semibold text-akari-muted">Price</th>
                  <th className="text-right py-4 px-5 font-semibold text-gradient-followers">24h Vol</th>
                  <th className="text-right py-4 px-5 font-semibold text-gradient-pink">24h %</th>
                  <th className="text-right py-4 px-5 font-semibold text-akari-muted">Source</th>
                </tr>
              </thead>
              <tbody>
                {sortedMemes.map((meme, idx) => {
                  const change = formatPriceChange(meme.change24hPct);
                  return (
                    <tr key={`${meme.symbol}-${idx}`} className="border-b border-akari-neon-teal/10 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5">
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{chainIcon(meme.chain)}</span>
                          <div>
                            <span className="font-semibold text-akari-text uppercase">{meme.symbol}</span>
                            <span className="text-akari-muted ml-2 text-xs hidden lg:inline">{meme.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-5">
                        <span className={`pill-neon px-2.5 py-1 text-xs font-medium border ${chainBadgeColor(meme.chain)}`}>
                          {formatChainLabel(meme.chain)}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-right text-akari-text font-medium">
                        {meme.priceUsd ? formatPrice(meme.priceUsd) : '—'}
                      </td>
                      <td className="py-4 px-5 text-right text-gradient-followers font-semibold">
                        {formatLargeNumber(meme.volume24hUsd)}
                      </td>
                      <td className={`py-4 px-5 text-right font-semibold ${change.color}`}>
                        {change.text}
                      </td>
                      <td className="py-4 px-5 text-right">
                        <span className="pill-neon px-2.5 py-1 bg-akari-cardSoft/50 border border-akari-neon-teal/20 text-akari-muted text-xs font-medium">
                          {meme.source}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: Compact 2-column layout */}
          <div className="md:hidden space-y-1.5">
            {sortedMemes.map((meme, idx) => {
              const change = formatPriceChange(meme.change24hPct);
              return (
                <div 
                  key={`${meme.symbol}-${idx}`}
                  className="flex items-center justify-between p-2 rounded-lg bg-akari-cardSoft/40"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">{chainIcon(meme.chain)}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-akari-text uppercase text-xs">{meme.symbol}</span>
                        <span className={`px-1 py-0.5 rounded text-[8px] ${chainBadgeColor(meme.chain)}`}>
                          {formatChainLabel(meme.chain)}
                        </span>
                      </div>
                      <span className="text-[10px] text-akari-muted">
                        {meme.priceUsd ? formatPrice(meme.priceUsd) : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] text-purple-400 font-medium">
                      {formatLargeNumber(meme.volume24hUsd)}
                    </div>
                    <div className={`text-[10px] ${change.color}`}>
                      {change.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Side widgets - only show if data exists */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {/* Solana Memes - only show if >= 2 */}
        {solanaMemes.length >= 2 && (
          <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-3">
            <h3 className="text-xs text-akari-primary uppercase tracking-wider mb-2">Solana Memes</h3>
            <div className="space-y-1">
              {solanaMemes.map((meme, idx) => {
                const change = formatPriceChange(meme.change24hPct);
                return (
                  <div key={`sol-${meme.symbol}-${idx}`} className="flex items-center justify-between text-xs py-1 border-b border-akari-border/10 last:border-0">
                    <div className="flex items-center gap-1">
                      <span>{chainIcon('solana')}</span>
                      <span className="text-akari-text uppercase font-medium">{meme.symbol}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-purple-400 text-[10px]">{formatLargeNumber(meme.volume24hUsd)}</span>
                      <span className={`text-[10px] ${change.color}`}>{change.text}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Prediction Candidates - only show if > 0 */}
        {topByLiquidity.length > 0 && (
          <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-3">
            <h3 className="text-xs text-green-400 uppercase tracking-wider mb-2">Prediction Candidates</h3>
            <div className="space-y-1">
              {topByLiquidity.map((meme, idx) => (
                <div key={`liq-${meme.symbol}-${idx}`} className="flex items-center justify-between text-xs py-1 border-b border-akari-border/10 last:border-0">
                  <div className="flex items-center gap-1">
                    <span>{chainIcon(meme.chain)}</span>
                    <span className="text-akari-text uppercase">{meme.symbol}</span>
                  </div>
                  <span className="text-green-400 font-medium">{formatLargeNumber(meme.liquidityUsd)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

export const getServerSideProps: GetServerSideProps<MemesPageProps> = async () => {
  try {
    // Get meme radar snapshot
    const { memes: rawMemes, lastUpdated } = await getMemeRadarSnapshot(50);

    // Fetch additional DEX info for symbols
    const symbols = rawMemes.map(m => m.symbol);
    let dexSnapshots: DexMarketSnapshot[] = [];
    if (symbols.length > 0) {
      dexSnapshots = await getDexSnapshotsForSymbols(symbols).catch(() => []);
    }

    // Group by symbol and pick best pair (highest volume, then liquidity)
    const bySymbol = new Map<string, AggregatedMeme>();
    
    for (const meme of rawMemes) {
      const key = meme.symbol.toUpperCase();
      
      // Skip majors (double check)
      if (isMajorToken(meme.symbol, meme.name)) continue;
      
      const existing = bySymbol.get(key);
      const dexInfo = dexSnapshots.find(d => d.symbol?.toUpperCase() === key);
      
      const candidateLiquidity = dexInfo?.liquidityUsd ?? meme.volume24hUsd ?? 0;
      const candidateVolume = meme.volume24hUsd ?? dexInfo?.volume24hUsd ?? 0;
      
      if (!existing) {
        bySymbol.set(key, {
          symbol: meme.symbol,
          name: meme.name,
          chain: meme.chain || dexInfo?.chain || null,
          priceUsd: meme.priceUsd ?? dexInfo?.priceUsd ?? null,
          volume24hUsd: candidateVolume,
          liquidityUsd: candidateLiquidity,
          change24hPct: meme.change24hPct,
          source: meme.source || dexInfo?.source || 'dex',
        });
        continue;
      }
      
      // Compare and keep the better one (higher volume wins, then liquidity)
      const existingVol = existing.volume24hUsd ?? 0;
      const existingLiq = existing.liquidityUsd ?? 0;
      
      if (candidateVolume > existingVol || 
          (candidateVolume === existingVol && candidateLiquidity > existingLiq)) {
        bySymbol.set(key, {
          symbol: meme.symbol,
          name: meme.name,
          chain: meme.chain || dexInfo?.chain || existing.chain,
          priceUsd: meme.priceUsd ?? dexInfo?.priceUsd ?? existing.priceUsd,
          volume24hUsd: candidateVolume,
          liquidityUsd: candidateLiquidity,
          change24hPct: meme.change24hPct ?? existing.change24hPct,
          source: meme.source || dexInfo?.source || existing.source,
        });
      }
    }

    // Also check DEX snapshots for any memes we might have missed
    for (const dex of dexSnapshots) {
      if (!dex.symbol) continue;
      const key = dex.symbol.toUpperCase();
      
      // Skip majors and already processed
      if (isMajorToken(dex.symbol, dex.name)) continue;
      if (bySymbol.has(key)) continue;
      
      bySymbol.set(key, {
        symbol: dex.symbol,
        name: dex.name || dex.symbol,
        chain: dex.chain,
        priceUsd: dex.priceUsd,
        volume24hUsd: dex.volume24hUsd,
        liquidityUsd: dex.liquidityUsd,
        change24hPct: null,
        source: dex.source || 'dex',
      });
    }

    const memes = Array.from(bySymbol.values());

    return {
      props: {
        memes: JSON.parse(JSON.stringify(memes)),
        lastUpdated: lastUpdated ? lastUpdated.toISOString() : null,
      },
    };
  } catch (error: unknown) {
    console.error('[Memes Page] Error:', error);
    return {
      props: {
        memes: [],
        lastUpdated: null,
        error: 'Failed to load meme radar',
      },
    };
  }
};
