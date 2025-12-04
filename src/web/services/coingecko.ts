/**
 * CoinGecko API Service
 * 
 * Fetches trending coins and their current prices from CoinGecko API.
 * 
 * TODO: If using CoinGecko Pro API, set COINGECKO_API_KEY in environment variables.
 * Free tier doesn't require an API key.
 */

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

/**
 * Get trending coins from CoinGecko with their current USD prices.
 * Returns up to 10 coins.
 */
export async function getTrendingCoinsWithPrices(): Promise<TrendingCoinWithPrice[]> {
  // TODO: Set COINGECKO_API_KEY in environment variables if using Pro API
  const apiKey = process.env.COINGECKO_API_KEY;
  const baseUrl = 'https://api.coingecko.com/api/v3';
  
  // Build headers with API key if provided
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers['x-cg-demo-api-key'] = apiKey;
  }

  try {
    // Step 1: Get trending coins
    const trendingUrl = `${baseUrl}/search/trending`;
    const trendingResponse = await fetch(trendingUrl, { headers });
    
    if (!trendingResponse.ok) {
      throw new Error(`CoinGecko trending API failed: ${trendingResponse.status} ${trendingResponse.statusText}`);
    }
    
    const trendingData: CoinGeckoTrendingResponse = await trendingResponse.json();
    
    // Extract up to 10 coin IDs
    const coinIds = trendingData.coins
      .slice(0, 10)
      .map(coin => coin.item.id);
    
    if (coinIds.length === 0) {
      console.warn('[CoinGecko] No trending coins found');
      return [];
    }

    // Step 2: Get market data for these coins using coins/markets endpoint
    const marketsUrl = `${baseUrl}/coins/markets?vs_currency=usd&ids=${coinIds.join(',')}&order=market_cap_desc&per_page=10&page=1&sparkline=false`;
    const marketsResponse = await fetch(marketsUrl, { headers });
    
    if (!marketsResponse.ok) {
      throw new Error(`CoinGecko markets API failed: ${marketsResponse.status} ${marketsResponse.statusText}`);
    }
    
    const marketsData: CoinGeckoMarketCoin[] = await marketsResponse.json();

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
    throw error;
  }
}

/**
 * Get price for a specific coin by symbol from CoinGecko.
 * Uses the /simple/price endpoint with symbol lookup.
 */
export async function getPriceBySymbol(symbol: string): Promise<number | null> {
  const apiKey = process.env.COINGECKO_API_KEY;
  const baseUrl = 'https://api.coingecko.com/api/v3';
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers['x-cg-demo-api-key'] = apiKey;
  }

  try {
    // First, search for the coin by symbol to get its ID
    const searchUrl = `${baseUrl}/search?query=${encodeURIComponent(symbol)}`;
    const searchResponse = await fetch(searchUrl, { headers });
    
    if (!searchResponse.ok) {
      console.error(`[CoinGecko] Search API failed for ${symbol}: ${searchResponse.status}`);
      return null;
    }
    
    const searchData: { coins?: Array<{ id: string; symbol: string }> } = await searchResponse.json();
    
    if (!searchData.coins || searchData.coins.length === 0) {
      return null;
    }
    
    // Find exact symbol match (case-insensitive)
    const coin = searchData.coins.find(c => c.symbol.toLowerCase() === symbol.toLowerCase());
    if (!coin) {
      return null;
    }
    
    // Get price for this coin ID
    const priceUrl = `${baseUrl}/simple/price?ids=${coin.id}&vs_currencies=usd`;
    const priceResponse = await fetch(priceUrl, { headers });
    
    if (!priceResponse.ok) {
      console.error(`[CoinGecko] Price API failed for ${coin.id}: ${priceResponse.status}`);
      return null;
    }
    
    const priceData: CoinGeckoPriceResponse = await priceResponse.json();
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

  const apiKey = process.env.COINGECKO_API_KEY;
  const baseUrl = 'https://api.coingecko.com/api/v3';
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers['x-cg-demo-api-key'] = apiKey;
  }

  try {
    const marketsUrl = `${baseUrl}/coins/markets?vs_currency=usd&ids=${coinIds.join(',')}&order=market_cap_desc&per_page=250&page=1&sparkline=false`;
    const marketsResponse = await fetch(marketsUrl, { headers });
    
    if (!marketsResponse.ok) {
      throw new Error(`CoinGecko markets API failed: ${marketsResponse.status} ${marketsResponse.statusText}`);
    }
    
    const marketsData: CoinGeckoMarketCoin[] = await marketsResponse.json();
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
  const apiKey = process.env.COINGECKO_API_KEY;
  const baseUrl = 'https://api.coingecko.com/api/v3';
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers['x-cg-demo-api-key'] = apiKey;
  }

  try {
    const marketsUrl = `${baseUrl}/coins/markets?vs_currency=usd&order=volume_desc&per_page=${limit}&page=1&sparkline=false`;
    const marketsResponse = await fetch(marketsUrl, { headers });
    
    if (!marketsResponse.ok) {
      throw new Error(`CoinGecko markets API failed: ${marketsResponse.status} ${marketsResponse.statusText}`);
    }
    
    const marketsData: CoinGeckoMarketCoin[] = await marketsResponse.json();
    return marketsData;
  } catch (error) {
    console.error('[CoinGecko] Error fetching top coins by volume:', error);
    return [];
  }
}

