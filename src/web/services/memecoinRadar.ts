/**
 * Meme Coin Radar Service
 * 
 * Fetches top Pump.fun memecoins from CoinGecko API.
 * 
 * TODO: If using CoinGecko Pro API, set COINGECKO_API_KEY in environment variables.
 * Free tier doesn't require an API key.
 */

export type MemeCoin = {
  id: string;        // coingecko id, e.g. "dogwifcoin"
  symbol: string;    // e.g. "wif"
  name: string;      // e.g. "dogwifhat"
  priceUsd: number;  // current price in USD
  marketCapUsd: number | null;
  priceChange24h: number | null; // percent, if available
};

interface CoinGeckoMarketCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  market_cap: number | null;
  price_change_percentage_24h: number | null;
}

const COINGECKO_API_BASE_URL = 'https://api.coingecko.com/api/v3';
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

async function fetchWithCoinGeckoAuth(url: string): Promise<Response> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (COINGECKO_API_KEY) {
    headers['x-cg-pro-api-key'] = COINGECKO_API_KEY;
  }
  return fetch(url, { headers });
}

/**
 * Get top Pump.fun memecoins from CoinGecko, ordered by volume.
 * Returns up to the specified limit (default: 10).
 */
export async function getTopPumpFunMemecoins(limit: number = 10): Promise<MemeCoin[]> {
  try {
    const url = new URL(`${COINGECKO_API_BASE_URL}/coins/markets`);
    url.searchParams.set('vs_currency', 'usd');
    url.searchParams.set('category', 'pump-fun');
    url.searchParams.set('order', 'volume_desc');
    url.searchParams.set('per_page', limit.toString());
    url.searchParams.set('page', '1');

    const response = await fetchWithCoinGeckoAuth(url.toString());

    if (!response.ok) {
      console.error('[memecoinRadar] error:', `CoinGecko markets API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data: CoinGeckoMarketCoin[] = await response.json();

    // Filter out entries missing symbol or current_price, and map to MemeCoin type
    const memecoins: MemeCoin[] = data
      .filter((coin) => coin.symbol && coin.current_price !== null && coin.current_price !== undefined)
      .map((coin) => ({
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        priceUsd: coin.current_price!,
        marketCapUsd: coin.market_cap ?? null,
        priceChange24h: coin.price_change_percentage_24h ?? null,
      }));

    return memecoins;
  } catch (error) {
    console.error('[memecoinRadar] error:', error);
    return [];
  }
}

