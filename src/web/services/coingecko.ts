/**
 * CoinGecko API Service
 * 
 * Fetches trending coins and their current prices from CoinGecko API.
 * 
 * Set COINGECKO_API_KEY in environment variables for Demo API access.
 * If not set, falls back to unauthenticated public API (higher rate limits).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Module State
// ─────────────────────────────────────────────────────────────────────────────

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

/** Module-scoped flag to ensure we only log the missing API key warning once */
let hasWarnedAboutMissingKey = false;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TrendingCoinWithPrice = {
  id: string;       // coingecko id, e.g. "bitcoin"
  symbol: string;   // btc
  name: string;     // Bitcoin
  priceUsd: number;
  imageUrl?: string;      // coin logo image URL
  marketCapUsd?: number;  // market cap in USD
  volume24hUsd?: number;   // 24h volume in USD
  change24hPct?: number;   // 24h price change percentage
};

interface CoinGeckoTrendingCoin {
  id: string;
  name: string;
  symbol: string;
  thumb: string;
  small: string;
  large: string;
  slug: string;
  price_btc: number;
}

interface CoinGeckoTrendingResponse {
  coins: Array<{
    item: CoinGeckoTrendingCoin;
  }>;
}

export interface CoinGeckoMarketCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number | null;
  total_volume: number | null;
  price_change_percentage_24h: number | null;
}

interface CoinGeckoPriceResponse {
  [coinId: string]: {
    usd: number;
  };
}

interface CoinGeckoSearchResponse {
  coins?: Array<{ id: string; symbol: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helper: fetchFromCoinGecko
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generic helper for all CoinGecko API requests.
 * 
 * - Automatically attaches API key (header + query param) if COINGECKO_API_KEY is set.
 * - Logs a one-time warning if no API key is configured.
 * - Returns parsed JSON on success, or null on error.
 * 
 * @param path - The API path (e.g. "/search/trending")
 * @param searchParams - Optional query parameters
 * @returns Parsed JSON response, or null if request failed
 */
async function fetchFromCoinGecko<T = unknown>(
  path: string,
  searchParams?: Record<string, string | number | undefined>
): Promise<T | null> {
  const apiKey = process.env.COINGECKO_API_KEY;

  // Build URL
  const url = new URL(path, COINGECKO_BASE_URL);

  // Add search params
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  // Build headers
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // API key handling
  if (apiKey) {
    // Add API key as header
    headers['x-cg-demo-api-key'] = apiKey;
    // Also add as query param for safety
    url.searchParams.set('x_cg_demo_api_key', apiKey);
  } else {
    // Log one-time warning about missing API key
    if (!hasWarnedAboutMissingKey) {
      console.warn(
        '[CoinGecko] COINGECKO_API_KEY not set. Using unauthenticated public API (higher risk of rate limits).'
      );
      hasWarnedAboutMissingKey = true;
    }
  }

  try {
    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      console.error(
        `[CoinGecko] API error: ${response.status} ${response.statusText} for ${path}`
      );
      return null;
    }

    const data: T = await response.json();
    return data;
  } catch (error) {
    console.error(`[CoinGecko] Request failed for ${path}:`, error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get trending coins from CoinGecko with their current USD prices.
 * Returns up to 10 coins.
 */
export async function getTrendingCoinsWithPrices(): Promise<TrendingCoinWithPrice[]> {
  try {
    // Step 1: Get trending coins
    const trendingData = await fetchFromCoinGecko<CoinGeckoTrendingResponse>('/search/trending');

    if (!trendingData || !trendingData.coins) {
      console.warn('[CoinGecko] No trending data received');
      return [];
    }

    // Extract up to 10 coin IDs
    const coinIds = trendingData.coins
      .slice(0, 10)
      .map(coin => coin.item.id);

    if (coinIds.length === 0) {
      console.warn('[CoinGecko] No trending coins found');
      return [];
    }

    // Step 2: Get market data for these coins using coins/markets endpoint
    const marketsData = await fetchFromCoinGecko<CoinGeckoMarketCoin[]>('/coins/markets', {
      vs_currency: 'usd',
      ids: coinIds.join(','),
      order: 'market_cap_desc',
      per_page: 10,
      page: 1,
      sparkline: 'false',
    });

    if (!marketsData) {
      console.warn('[CoinGecko] No market data received for trending coins');
      return [];
    }

    // Create a map of coin IDs to market data for quick lookup
    const marketDataMap = new Map<string, CoinGeckoMarketCoin>();
    for (const marketCoin of marketsData) {
      marketDataMap.set(marketCoin.id, marketCoin);
    }

    // Combine trending data with market data, preserving trending order
    const result: TrendingCoinWithPrice[] = [];

    for (const coinItem of trendingData.coins.slice(0, 10)) {
      const coin = coinItem.item;
      const marketData = marketDataMap.get(coin.id);

      if (marketData && marketData.current_price) {
        result.push({
          id: coin.id,
          symbol: coin.symbol,
          name: coin.name,
          priceUsd: marketData.current_price,
          imageUrl: marketData.image || coin.small || coin.thumb || undefined,
          marketCapUsd: marketData.market_cap || undefined,
          volume24hUsd: marketData.total_volume || undefined,
          change24hPct: marketData.price_change_percentage_24h || undefined,
        });
      }
    }

    return result;
  } catch (error) {
    console.error('[CoinGecko] Error fetching trending coins:', error);
    return [];
  }
}

/**
 * Get price for a specific coin by symbol from CoinGecko.
 * Uses the /simple/price endpoint with symbol lookup.
 */
export async function getPriceBySymbol(symbol: string): Promise<number | null> {
  try {
    // First, search for the coin by symbol to get its ID
    const searchData = await fetchFromCoinGecko<CoinGeckoSearchResponse>('/search', {
      query: symbol,
    });

    if (!searchData || !searchData.coins || searchData.coins.length === 0) {
      return null;
    }

    // Find exact symbol match (case-insensitive)
    const coin = searchData.coins.find(c => c.symbol.toLowerCase() === symbol.toLowerCase());
    if (!coin) {
      return null;
    }

    // Get price for this coin ID
    const priceData = await fetchFromCoinGecko<CoinGeckoPriceResponse>('/simple/price', {
      ids: coin.id,
      vs_currencies: 'usd',
    });

    if (!priceData) {
      return null;
    }

    const priceInfo = priceData[coin.id];

    if (priceInfo && priceInfo.usd) {
      return priceInfo.usd;
    }

    return null;
  } catch (error) {
    console.error(`[CoinGecko] Error fetching price for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get market data for specific coin IDs from CoinGecko.
 * Returns market data including price, market cap, volume, and 24h change.
 */
export async function getMarketDataForCoins(coinIds: string[]): Promise<CoinGeckoMarketCoin[]> {
  if (coinIds.length === 0) {
    return [];
  }

  try {
    const marketsData = await fetchFromCoinGecko<CoinGeckoMarketCoin[]>('/coins/markets', {
      vs_currency: 'usd',
      ids: coinIds.join(','),
      order: 'market_cap_desc',
      per_page: 250,
      page: 1,
      sparkline: 'false',
    });

    if (!marketsData) {
      return [];
    }

    return marketsData;
  } catch (error) {
    console.error('[CoinGecko] Error fetching market data for coins:', error);
    return [];
  }
}

/**
 * Get top coins by 24h volume from CoinGecko.
 */
export async function getTopCoinsByVolume(limit: number = 10): Promise<CoinGeckoMarketCoin[]> {
  try {
    const marketsData = await fetchFromCoinGecko<CoinGeckoMarketCoin[]>('/coins/markets', {
      vs_currency: 'usd',
      order: 'volume_desc',
      per_page: limit,
      page: 1,
      sparkline: 'false',
    });

    if (!marketsData) {
      return [];
    }

    return marketsData;
  } catch (error) {
    console.error('[CoinGecko] Error fetching top coins by volume:', error);
    return [];
  }
}
