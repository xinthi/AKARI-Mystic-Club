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

    // Step 2: Get prices for these coins
    const priceUrl = `${baseUrl}/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd`;
    const priceResponse = await fetch(priceUrl, { headers });
    
    if (!priceResponse.ok) {
      throw new Error(`CoinGecko price API failed: ${priceResponse.status} ${priceResponse.statusText}`);
    }
    
    const priceData: CoinGeckoPriceResponse = await priceResponse.json();

    // Combine trending data with prices
    const result: TrendingCoinWithPrice[] = [];
    
    for (const coinItem of trendingData.coins.slice(0, 10)) {
      const coin = coinItem.item;
      const priceInfo = priceData[coin.id];
      
      if (priceInfo && priceInfo.usd) {
        result.push({
          id: coin.id,
          symbol: coin.symbol,
          name: coin.name,
          priceUsd: priceInfo.usd,
        });
      }
    }

    return result;
  } catch (error) {
    console.error('[CoinGecko] Error fetching trending coins:', error);
    throw error;
  }
}

