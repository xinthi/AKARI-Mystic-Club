/**
 * CoinGecko API Service
 * 
 * Fetches trending coins and their current prices from CoinGecko API.
 * 
 * Set COINGECKO_API_KEY in environment variables for authenticated API access.
 * - With API key: uses pro-api.coingecko.com
 * - Without API key: uses api.coingecko.com (public, rate-limited)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Module State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CoinGecko API base URL - always use the public endpoint.
 * The API key (demo or pro) is sent via headers.
 */
const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

/** Module-scoped flag to ensure we only log the base URL info once */
let hasLoggedBaseUrl = false;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TrendingCoinWithPrice = {
  id: string;       // coingecko id, e.g. "bitcoin"
  symbol: string;   // btc
  name: string;     // Bitcoin
  priceUsd: number;
  imageUrl?: string;      // coin logo image URL
  marketCapUsd?: number | null;  // market cap in USD
  volume24hUsd?: number | null;   // 24h volume in USD
  change24hPct?: number | null;   // 24h price change percentage
};

export interface CoinGeckoMarketCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number | null;
  total_volume: number | null;
  price_change_percentage_24h: number | null;
  price_change_percentage_24h_in_currency?: number | null;
}

interface CoinGeckoTrendingResponse {
  coins: Array<{
    item: {
      id: string;
      name: string;
      symbol: string;
      thumb?: string;
      small?: string;
      large?: string;
    };
  }>;
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
// Internal Helper: cgFetch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generic helper for all CoinGecko API requests.
 * 
 * - First attempts with API key headers (if COINGECKO_API_KEY is set)
 * - If that fails, falls back to unauthenticated request
 * - Returns parsed JSON on success, or null on error
 * 
 * @param path - The API path (e.g. "/search/trending")
 * @param params - Optional query parameters
 * @returns Parsed JSON response, or null if request failed
 */
export async function cgFetch<T = unknown>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<T | null> {
  const apiKey = process.env.COINGECKO_API_KEY;

  // Log base URL info once
  if (!hasLoggedBaseUrl) {
    console.log('[coingecko] Using base URL:', COINGECKO_BASE_URL, 'hasApiKey:', !!apiKey);
    hasLoggedBaseUrl = true;
  }

  // Build URL
  const url = new URL(path, COINGECKO_BASE_URL);

  // Add query params
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  /**
   * Make a request with or without API key headers
   */
  const makeRequest = async (useApiKey: boolean): Promise<{ resp: Response; ok: boolean }> => {
    const headers: HeadersInit = { Accept: 'application/json' };
    
    if (useApiKey && apiKey) {
      // Send all header variants for compatibility with demo/pro keys
      headers['x-cg-demo-api-key'] = apiKey;
      headers['x-cg-pro-api-key'] = apiKey;
      headers['x-cg-api-key'] = apiKey;
    }

    console.log('[coingecko] Fetching', path, 'useApiKey=', !!(useApiKey && apiKey));
    const resp = await fetch(url.toString(), { headers });
    const ok = resp.ok;
    
    if (!ok) {
      const text = await resp.text().catch(() => '(no body)');
      console.error('[coingecko] Error', path, 'status=', resp.status, resp.statusText, 'body=', text?.slice(0, 300));
    }
    
    return { resp, ok };
  };

  try {
    // 1) Try with API key (if present)
    let { resp, ok } = await makeRequest(true);
    
    if (!ok) {
      console.log('[coingecko] Authenticated request failed, trying fallback without API key...');
      // 2) Fallback: try again without API key
      ({ resp, ok } = await makeRequest(false));
      if (!ok) {
        console.error('[coingecko] Fallback request also failed for', path);
        return null;
      }
    }

    const data: T = await resp.json();
    return data;
  } catch (err) {
    console.error('[coingecko] cgFetch exception for', path, err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get trending coins from CoinGecko with their current USD prices.
 * Returns up to 20 coins.
 * 
 * Falls back through multiple strategies to ensure data is always returned:
 * 1. /search/trending → /coins/markets (by IDs)
 * 2. /coins/markets (by market cap)
 * 3. /coins/markets (by volume)
 */
export async function getTrendingCoinsWithPrices(): Promise<TrendingCoinWithPrice[]> {
  try {
    console.log('[coingecko] getTrendingCoinsWithPrices starting...');
    
    // Step 1: Try to get trending coins
    const trending = await cgFetch<CoinGeckoTrendingResponse>('/search/trending');
    
    let coinIds: string[] = [];
    const trendingCount = trending?.coins?.length ?? 0;
    console.log('[coingecko] /search/trending returned', trendingCount, 'coins');
    
    if (trendingCount > 0) {
      coinIds = trending!.coins.slice(0, 20).map(c => c.item.id);
    }

    // Step 2: If we have trending coin IDs, get their market data
    let result: TrendingCoinWithPrice[] = [];
    
    if (coinIds.length > 0) {
      const markets = await cgFetch<CoinGeckoMarketCoin[]>('/coins/markets', {
        vs_currency: 'usd',
        ids: coinIds.join(','),
        order: 'market_cap_desc',
        per_page: 20,
        page: 1,
        price_change_percentage: '24h',
      });

      const marketsCount = markets?.length ?? 0;
      console.log('[coingecko] /coins/markets (trending IDs) returned', marketsCount, 'coins');
      
      if (marketsCount > 0) {
        result = mapMarketsToTrendingCoins(markets!);
      }
    }

    // Step 3: Fallback #1 - if we still have no data, get top coins by market cap
    if (result.length === 0) {
      console.log('[coingecko] Fallback #1: top coins by market cap');
      const fallbackMarkets = await cgFetch<CoinGeckoMarketCoin[]>('/coins/markets', {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 20,
        page: 1,
        price_change_percentage: '24h',
      });

      const fallbackCount = fallbackMarkets?.length ?? 0;
      console.log('[coingecko] /coins/markets (market_cap_desc) returned', fallbackCount, 'coins');
      
      if (fallbackCount > 0) {
        result = mapMarketsToTrendingCoins(fallbackMarkets!);
      }
    }

    // Step 4: Fallback #2 - if STILL no data, try top coins by volume
    if (result.length === 0) {
      console.log('[coingecko] Fallback #2: top coins by volume');
      const volumeMarkets = await cgFetch<CoinGeckoMarketCoin[]>('/coins/markets', {
        vs_currency: 'usd',
        order: 'volume_desc',
        per_page: 20,
        page: 1,
        price_change_percentage: '24h',
      });

      const volumeCount = volumeMarkets?.length ?? 0;
      console.log('[coingecko] /coins/markets (volume_desc) returned', volumeCount, 'coins');
      
      if (volumeCount > 0) {
        result = mapMarketsToTrendingCoins(volumeMarkets!);
      }
    }

    console.log('[coingecko] getTrendingCoinsWithPrices final result length:', result.length);
    return result;
  } catch (error) {
    console.error('[coingecko] getTrendingCoinsWithPrices exception:', error);
    return [];
  }
}

/**
 * Map CoinGecko market data to TrendingCoinWithPrice type
 */
function mapMarketsToTrendingCoins(markets: CoinGeckoMarketCoin[]): TrendingCoinWithPrice[] {
  return markets
    .filter(m => m.current_price !== null && m.current_price !== undefined)
    .map(m => ({
      id: m.id,
      symbol: m.symbol,
      name: m.name,
      priceUsd: m.current_price,
      imageUrl: m.image || undefined,
      marketCapUsd: m.market_cap ?? null,
      volume24hUsd: m.total_volume ?? null,
      change24hPct: m.price_change_percentage_24h_in_currency ?? m.price_change_percentage_24h ?? null,
    }));
}

/**
 * Get price for a specific coin by symbol from CoinGecko.
 * Uses the /search endpoint to find coin ID, then /simple/price for the price.
 */
export async function getPriceBySymbol(symbol: string): Promise<number | null> {
  try {
    console.log('[coingecko] getPriceBySymbol:', symbol);
    
    // First, search for the coin by symbol to get its ID
    const searchData = await cgFetch<CoinGeckoSearchResponse>('/search', {
      query: symbol,
    });

    if (!searchData || !searchData.coins || searchData.coins.length === 0) {
      console.log('[coingecko] No search results for symbol:', symbol);
      return null;
    }

    // Find exact symbol match (case-insensitive)
    const coin = searchData.coins.find(c => c.symbol.toLowerCase() === symbol.toLowerCase());
    if (!coin) {
      console.log('[coingecko] No exact symbol match for:', symbol);
      return null;
    }

    // Get price for this coin ID
    const priceData = await cgFetch<CoinGeckoPriceResponse>('/simple/price', {
      ids: coin.id,
      vs_currencies: 'usd',
    });

    if (!priceData) {
      console.log('[coingecko] No price data for coin:', coin.id);
      return null;
    }

    const priceInfo = priceData[coin.id];
    if (priceInfo && priceInfo.usd) {
      console.log('[coingecko] Price for', symbol, ':', priceInfo.usd);
      return priceInfo.usd;
    }

    return null;
  } catch (error) {
    console.error(`[coingecko] getPriceBySymbol(${symbol}) exception:`, error);
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
    const marketsData = await cgFetch<CoinGeckoMarketCoin[]>('/coins/markets', {
      vs_currency: 'usd',
      ids: coinIds.join(','),
      order: 'market_cap_desc',
      per_page: 250,
      page: 1,
    });

    if (!marketsData) {
      console.error('[coingecko] getMarketDataForCoins: /coins/markets returned null');
      return [];
    }

    return marketsData;
  } catch (error) {
    console.error('[coingecko] getMarketDataForCoins exception:', error);
    return [];
  }
}

/**
 * Get top coins by 24h volume from CoinGecko.
 */
export async function getTopCoinsByVolume(limit: number = 10): Promise<CoinGeckoMarketCoin[]> {
  try {
    const marketsData = await cgFetch<CoinGeckoMarketCoin[]>('/coins/markets', {
      vs_currency: 'usd',
      order: 'volume_desc',
      per_page: limit,
      page: 1,
    });

    if (!marketsData) {
      console.error('[coingecko] getTopCoinsByVolume: /coins/markets returned null');
      return [];
    }

    return marketsData;
  } catch (error) {
    console.error('[coingecko] getTopCoinsByVolume exception:', error);
    return [];
  }
}
