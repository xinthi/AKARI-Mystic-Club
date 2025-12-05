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
 * CoinGecko API endpoint selection:
 * - Demo API keys (free tier) work ONLY on api.coingecko.com
 * - Pro API keys work on pro-api.coingecko.com
 * 
 * Since most users have Demo keys, we default to the public endpoint.
 * Set COINGECKO_USE_PRO=true if you have a paid Pro key.
 */
const USE_PRO_API = process.env.COINGECKO_USE_PRO === 'true';

const COINGECKO_BASE_URL = USE_PRO_API
  ? 'https://pro-api.coingecko.com/api/v3'
  : 'https://api.coingecko.com/api/v3';

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
 * - Uses pro-api.coingecko.com if COINGECKO_API_KEY is set
 * - Falls back to api.coingecko.com (public) if no key
 * - Attaches all possible API key headers for compatibility
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

  // Build headers
  const headers: HeadersInit = {
    'Accept': 'application/json',
  };

  // API key handling
  // Demo keys use x-cg-demo-api-key, Pro keys use x-cg-pro-api-key
  if (apiKey) {
    if (USE_PRO_API) {
      headers['x-cg-pro-api-key'] = apiKey;
    } else {
      headers['x-cg-demo-api-key'] = apiKey;
    }
  }

  try {
    console.log('[coingecko] Fetching URL:', url.toString(), 'hasApiKey:', !!apiKey);
    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '(no body)');
      console.error(
        '[coingecko] Request failed',
        url.toString(),
        'status',
        response.status,
        response.statusText,
        bodyText.slice(0, 300)
      );
      return null;
    }

    const data: T = await response.json();
    return data;
  } catch (error) {
    console.error('[coingecko] Fetch exception for', url.toString(), ':', error);
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
 * Falls back to top coins by market cap if trending endpoint returns no data.
 */
export async function getTrendingCoinsWithPrices(): Promise<TrendingCoinWithPrice[]> {
  try {
    console.log('[coingecko] getTrendingCoinsWithPrices starting...');
    
    // Step 1: Try to get trending coins
    const trending = await cgFetch<CoinGeckoTrendingResponse>('/search/trending');
    
    let coinIds: string[] = [];
    
    if (trending && trending.coins && trending.coins.length > 0) {
      console.log('[coingecko] /search/trending returned', trending.coins.length, 'coins');
      coinIds = trending.coins.slice(0, 20).map(c => c.item.id);
    } else {
      console.log('[coingecko] /search/trending returned no coins, falling back to /coins/markets');
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

      if (markets && markets.length > 0) {
        console.log('[coingecko] /coins/markets returned', markets.length, 'coins for trending ids');
        result = mapMarketsToTrendingCoins(markets);
      } else {
        console.error('[coingecko] getTrendingCoinsWithPrices: /coins/markets returned null for trending ids');
      }
    }

    // Step 3: Fallback - if we still have no data, get top coins by market cap
    if (result.length === 0) {
      console.log('[coingecko] Using fallback: top coins by market cap');
      const fallbackMarkets = await cgFetch<CoinGeckoMarketCoin[]>('/coins/markets', {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 20,
        page: 1,
        price_change_percentage: '24h',
      });

      if (fallbackMarkets && fallbackMarkets.length > 0) {
        console.log('[coingecko] Fallback /coins/markets returned', fallbackMarkets.length, 'coins');
        result = mapMarketsToTrendingCoins(fallbackMarkets);
      } else {
        console.error('[coingecko] getTrendingCoinsWithPrices: fallback /coins/markets also returned null');
      }
    }

    console.log('[coingecko] getTrendingCoinsWithPrices result length:', result.length);
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
