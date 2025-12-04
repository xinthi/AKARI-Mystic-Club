/**
 * Akari Markets Service
 * 
 * Aggregates data from multiple sources to provide market insights:
 * - CoinGecko trending coins
 * - Pump.fun memecoins
 * - Launchpad launches with ROI metrics
 */

import { getTrendingCoinsWithPrices, type TrendingCoinWithPrice } from './coingecko';
import { getTopPumpFunMemecoins, type MemeCoin } from './memecoinRadar';
import { getAllLaunchesWithMetrics, type LaunchWithMetrics } from '../lib/portal/db';

export interface MarketPulse {
  trackedMarketCapUsd: number;
  trackedVolume24hUsd: number;
  sources: string[];
}

export interface AkariHighlights {
  trending: Array<{
    id: string;
    symbol: string;
    name: string;
    priceUsd: number;
  }>;
  topMemes: Array<{
    id: string;
    symbol: string;
    name: string;
    priceUsd: number;
    change24h: number | null;
  }>;
  topLaunches: Array<{
    id: string;
    tokenSymbol: string;
    platformName: string | null;
    roiPercent: number | null;
  }>;
}

/**
 * Get market pulse metrics aggregating data from all sources
 */
export async function getMarketPulse(): Promise<MarketPulse> {
  try {
    const [trendingCoins, memecoins] = await Promise.all([
      getTrendingCoinsWithPrices().catch(() => []),
      getTopPumpFunMemecoins(50).catch(() => []),
    ]);

    // Calculate tracked market cap (sum of available marketCapUsd from memecoins)
    let trackedMarketCapUsd = 0;
    for (const meme of memecoins) {
      if (meme.marketCapUsd !== null) {
        trackedMarketCapUsd += meme.marketCapUsd;
      }
    }

    // Volume24h is not available in current data structures, so set to 0 for now
    const trackedVolume24hUsd = 0;

    // Determine sources based on what we're using
    const sources: string[] = [];
    if (trendingCoins.length > 0) {
      sources.push('CoinGecko');
    }
    if (memecoins.length > 0) {
      sources.push('CoinGecko'); // Memecoins also come from CoinGecko
    }

    // Check if we have launches (which might use DexScreener)
    try {
      const launches = await getAllLaunchesWithMetrics();
      if (launches.length > 0) {
        // Check if any launch has DexScreener as price source
        const hasDexScreener = launches.some(
          (l) => l.priceSource === 'DEXSCREENER' || l.latestSnapshot?.source === 'DEXSCREENER'
        );
        if (hasDexScreener && !sources.includes('DexScreener')) {
          sources.push('DexScreener');
        }
      }
    } catch {
      // Ignore launch fetch errors for pulse calculation
    }

    // Remove duplicates and ensure we have at least one source
    const uniqueSources = Array.from(new Set(sources));
    if (uniqueSources.length === 0) {
      uniqueSources.push('CoinGecko'); // Default fallback
    }

    return {
      trackedMarketCapUsd,
      trackedVolume24hUsd,
      sources: uniqueSources,
    };
  } catch (error) {
    console.error('[AkariMarkets] Error calculating market pulse:', error);
    return {
      trackedMarketCapUsd: 0,
      trackedVolume24hUsd: 0,
      sources: ['CoinGecko'],
    };
  }
}

/**
 * Get top highlights from all data sources
 */
export async function getAkariHighlights(): Promise<AkariHighlights> {
  try {
    const [trendingCoins, memecoins, launches] = await Promise.all([
      getTrendingCoinsWithPrices().catch(() => []),
      getTopPumpFunMemecoins(50).catch(() => []),
      getAllLaunchesWithMetrics().catch(() => []),
    ]);

    // Top 3 trending coins
    const trending = trendingCoins.slice(0, 3).map((coin) => ({
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      priceUsd: coin.priceUsd,
    }));

    // Top 3 memecoins sorted by priceChange24h descending
    const topMemes = [...memecoins]
      .filter((m) => m.priceChange24h !== null)
      .sort((a, b) => {
        const changeA = a.priceChange24h ?? 0;
        const changeB = b.priceChange24h ?? 0;
        return changeB - changeA;
      })
      .slice(0, 3)
      .map((meme) => ({
        id: meme.id,
        symbol: meme.symbol,
        name: meme.name,
        priceUsd: meme.priceUsd,
        change24h: meme.priceChange24h ?? null,
      }));

    // Top 3 launches sorted by roiPercent descending
    const topLaunches = [...launches]
      .filter((l) => l.roiPercent !== null && l.roiPercent !== undefined)
      .sort((a, b) => {
        const roiA = a.roiPercent ?? 0;
        const roiB = b.roiPercent ?? 0;
        return roiB - roiA;
      })
      .slice(0, 3)
      .map((launch) => ({
        id: launch.id,
        tokenSymbol: launch.tokenSymbol,
        platformName: launch.primaryPlatform?.name || launch.platform?.name || null,
        roiPercent: launch.roiPercent,
      }));

    return {
      trending,
      topMemes,
      topLaunches,
    };
  } catch (error) {
    console.error('[AkariMarkets] Error getting highlights:', error);
    return {
      trending: [],
      topMemes: [],
      topLaunches: [],
    };
  }
}

/**
 * Get full trending market table data
 */
export async function getTrendingMarketTable(): Promise<TrendingCoinWithPrice[]> {
  try {
    return await getTrendingCoinsWithPrices();
  } catch (error) {
    console.error('[AkariMarkets] Error getting trending market table:', error);
    return [];
  }
}

