/**
 * Akari Narratives Service
 * 
 * Fetches and aggregates market data for different crypto narratives:
 * - AI Markets
 * - GameFi
 * - DeFi & L2s
 * - InfoFi
 * 
 * Also provides volume leaders data.
 */

import { getMarketDataForCoins, getTopCoinsByVolume, type CoinGeckoMarketCoin } from './coingecko';

export type NarrativeSummary = {
  key: 'ai' | 'gamefi' | 'defi_l2' | 'infofi';
  title: string;
  totalMarketCapUsd: number;
  avgChange24hPct: number;
  topTokens: {
    id: string;
    symbol: string;
    name: string;
    priceUsd: number;
    change24hPct: number;
  }[];
};

export type VolumeLeader = {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  volume24hUsd: number;
  change24hPct: number;
};

// Hardcoded token IDs per narrative (CoinGecko IDs)
const NARRATIVE_TOKENS: Record<string, string[]> = {
  ai: ['fetch-ai', 'render-token', 'bittensor', 'ocean-protocol', 'singularitynet', 'cortex'],
  gamefi: ['axie-infinity', 'immutable-x', 'gala', 'the-sandbox', 'enjincoin', 'illuvium'],
  defi_l2: ['ethereum', 'arbitrum', 'optimism', 'polygon', 'avalanche-2', 'chainlink'],
  infofi: ['chainlink', 'the-graph', 'band-protocol', 'api3', 'uma', 'dydx-chain'],
};

/**
 * Get narrative summaries with aggregated market data
 */
export async function getNarrativeSummaries(): Promise<NarrativeSummary[]> {
  const summaries: NarrativeSummary[] = [];

  for (const [key, coinIds] of Object.entries(NARRATIVE_TOKENS)) {
    try {
      // Fetch market data for all tokens in this narrative
      const marketData = await getMarketDataForCoins(coinIds);

      if (marketData.length === 0) {
        // If no data, create empty summary
        summaries.push({
          key: key as NarrativeSummary['key'],
          title: getNarrativeTitle(key),
          totalMarketCapUsd: 0,
          avgChange24hPct: 0,
          topTokens: [],
        });
        continue;
      }

      // Calculate totals
      let totalMarketCapUsd = 0;
      let totalChange24hPct = 0;
      let validChanges = 0;

      for (const coin of marketData) {
        if (coin.market_cap) {
          totalMarketCapUsd += coin.market_cap;
        }
        if (coin.price_change_percentage_24h !== null) {
          totalChange24hPct += coin.price_change_percentage_24h;
          validChanges++;
        }
      }

      const avgChange24hPct = validChanges > 0 ? totalChange24hPct / validChanges : 0;

      // Get top 3 tokens by market cap
      const sortedByMarketCap = [...marketData]
        .filter((c) => c.market_cap !== null)
        .sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0))
        .slice(0, 3);

      const topTokens = sortedByMarketCap.map((coin) => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        priceUsd: coin.current_price,
        change24hPct: coin.price_change_percentage_24h || 0,
      }));

      summaries.push({
        key: key as NarrativeSummary['key'],
        title: getNarrativeTitle(key),
        totalMarketCapUsd,
        avgChange24hPct,
        topTokens,
      });
    } catch (error) {
      console.error(`[AkariNarratives] Error fetching ${key} narrative:`, error);
      // Add empty summary on error
      summaries.push({
        key: key as NarrativeSummary['key'],
        title: getNarrativeTitle(key),
        totalMarketCapUsd: 0,
        avgChange24hPct: 0,
        topTokens: [],
      });
    }
  }

  return summaries;
}

/**
 * Get top volume leaders
 */
export async function getVolumeLeaders(limit: number = 5): Promise<VolumeLeader[]> {
  try {
    const marketData = await getTopCoinsByVolume(limit);

    return marketData.map((coin) => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      priceUsd: coin.current_price,
      volume24hUsd: coin.total_volume || 0,
      change24hPct: coin.price_change_percentage_24h || 0,
    }));
  } catch (error) {
    console.error('[AkariNarratives] Error fetching volume leaders:', error);
    return [];
  }
}

function getNarrativeTitle(key: string): string {
  const titles: Record<string, string> = {
    ai: 'AI Markets',
    gamefi: 'GameFi',
    defi_l2: 'DeFi & L2s',
    infofi: 'InfoFi',
  };
  return titles[key] || key;
}


