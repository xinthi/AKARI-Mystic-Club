/**
 * Portal Market Metrics
 * 
 * Computes aggregated market metrics from snapshot tables.
 * Falls back to CoinGecko global data when local data is insufficient.
 */

import { PrismaClient } from '@prisma/client';

export interface TrackedMarketMetrics {
  totalMarketCapUsd: number | null;
  totalVolume24hUsd: number | null;
  source: 'snapshots' | 'coingecko' | 'none';
}

/**
 * Get tracked market metrics from snapshot tables.
 * Falls back to CoinGecko global data if no recent snapshots.
 */
export async function getTrackedMarketMetrics(
  prisma: PrismaClient
): Promise<TrackedMarketMetrics> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    // Query recent snapshots from all tables
    const [marketSnapshots, dexSnapshots, cexSnapshots] = await Promise.all([
      prisma.marketSnapshot.findMany({
        where: { createdAt: { gte: oneDayAgo } },
        select: { marketCapUsd: true, volume24hUsd: true },
      }),
      prisma.dexMarketSnapshot.findMany({
        where: { createdAt: { gte: oneDayAgo } },
        select: { liquidityUsd: true, volume24hUsd: true },
      }),
      prisma.cexMarketSnapshot.findMany({
        where: { createdAt: { gte: oneDayAgo } },
        select: { volume24hUsd: true },
      }),
    ]);

    // Calculate totals
    let totalMarketCap = 0;
    let totalVolume = 0;
    let hasData = false;

    // MarketSnapshot - has real market cap data
    for (const snap of marketSnapshots) {
      if (snap.marketCapUsd) {
        totalMarketCap += snap.marketCapUsd;
        hasData = true;
      }
      if (snap.volume24hUsd) {
        totalVolume += snap.volume24hUsd;
      }
    }

    // DEX snapshots - use liquidity as proxy for tracked value
    for (const snap of dexSnapshots) {
      if (snap.liquidityUsd) {
        totalMarketCap += snap.liquidityUsd;
        hasData = true;
      }
      if (snap.volume24hUsd) {
        totalVolume += snap.volume24hUsd;
      }
    }

    // CEX snapshots - volume only
    for (const snap of cexSnapshots) {
      if (snap.volume24hUsd) {
        totalVolume += snap.volume24hUsd;
      }
    }

    if (hasData && (totalMarketCap > 0 || totalVolume > 0)) {
      return {
        totalMarketCapUsd: totalMarketCap > 0 ? totalMarketCap : null,
        totalVolume24hUsd: totalVolume > 0 ? totalVolume : null,
        source: 'snapshots',
      };
    }

    // Fallback to CoinGecko global data
    return await fetchCoinGeckoGlobalMetrics();
  } catch (error) {
    console.error('[metrics] Error computing tracked metrics:', error);
    // Try CoinGecko as fallback
    try {
      return await fetchCoinGeckoGlobalMetrics();
    } catch {
      return {
        totalMarketCapUsd: null,
        totalVolume24hUsd: null,
        source: 'none',
      };
    }
  }
}

/**
 * Fetch global market data from CoinGecko as fallback
 */
async function fetchCoinGeckoGlobalMetrics(): Promise<TrackedMarketMetrics> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('https://api.coingecko.com/api/v3/global', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`CoinGecko API returned ${response.status}`);
    }

    const data = await response.json();
    const globalData = data?.data;

    if (!globalData) {
      throw new Error('Invalid CoinGecko response');
    }

    return {
      totalMarketCapUsd: globalData.total_market_cap?.usd || null,
      totalVolume24hUsd: globalData.total_volume?.usd || null,
      source: 'coingecko',
    };
  } catch (error) {
    console.error('[metrics] CoinGecko global fetch failed:', error);
    return {
      totalMarketCapUsd: null,
      totalVolume24hUsd: null,
      source: 'none',
    };
  }
}

/**
 * Format large numbers for display (e.g., $1.54B, $982.3M)
 */
export function formatMetricValue(value: number | null): string {
  if (value === null || value === undefined) {
    return 'Data warming up';
  }

  if (value >= 1_000_000_000_000) {
    return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  } else if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  } else if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  } else if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}

