/**
 * Meme Coin Radar Service
 * 
 * Fetches top Pump.fun memecoins from CoinGecko API.
 * 
 * Uses COINGECKO_API_KEY if available, falls back to public API otherwise.
 */

import { cgFetch } from './coingecko';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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

// Known meme coin symbols/keywords for fallback filtering
const MEME_KEYWORDS = [
  'pepe', 'doge', 'shib', 'wif', 'bonk', 'floki', 'meme', 'inu',
  'elon', 'moon', 'wojak', 'chad', 'frog', 'cat', 'dog', 'pump',
  'brett', 'popcat', 'mog', 'turbo', 'neiro', 'goat', 'pnut',
  'act', 'bome', 'myro', 'slerf', 'wen', 'book', 'samo', 'corgiai'
];

// ─────────────────────────────────────────────────────────────────────────────
// Exported Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get top Pump.fun memecoins from CoinGecko, ordered by volume.
 * Returns up to the specified limit (default: 10).
 * 
 * Falls back to general meme coins if Pump.fun category returns no data.
 */
export async function getTopPumpFunMemecoins(limit: number = 10): Promise<MemeCoin[]> {
  try {
    console.log('[memecoinRadar] getTopPumpFunMemecoins starting, limit:', limit);
    
    // Step 1: Try the Pump.fun category
    let result = await fetchPumpFunCoins(limit);
    
    if (result.length > 0) {
      console.log('[memecoinRadar] Pump.fun category returned', result.length, 'coins');
    } else {
      console.log('[memecoinRadar] Primary Pump.fun query returned no data, falling back to /coins/markets (meme-ish filter)');
      
      // Step 2: Fallback - try meme-token category
      result = await fetchMemeCategory(limit);
      
      if (result.length > 0) {
        console.log('[memecoinRadar] meme-token category returned', result.length, 'coins');
      } else {
        console.log('[memecoinRadar] meme-token category also empty, trying keyword filter fallback');
        
        // Step 3: Final fallback - get top coins and filter by meme keywords
        result = await fetchTopCoinsWithMemeFilter(limit);
        
        if (result.length > 0) {
          console.log('[memecoinRadar] Keyword filter fallback returned', result.length, 'coins');
        } else {
          console.log('[memecoinRadar] All fallbacks exhausted, returning empty array');
        }
      }
    }

    // Slice to requested limit
    const finalResult = result.slice(0, limit);
    console.log('[memecoinRadar] getTopPumpFunMemecoins result length:', finalResult.length);
    return finalResult;
  } catch (error) {
    console.error('[memecoinRadar] getTopPumpFunMemecoins exception:', error);
    return [];
  }
}

/**
 * Fetch coins from the Pump.fun category
 */
async function fetchPumpFunCoins(limit: number): Promise<MemeCoin[]> {
  const data = await cgFetch<CoinGeckoMarketCoin[]>('/coins/markets', {
    vs_currency: 'usd',
    category: 'pump-fun',
    order: 'volume_desc',
    per_page: limit,
    page: 1,
  });

  if (!data || data.length === 0) {
    return [];
  }

  return mapToMemeCoins(data);
}

/**
 * Fetch coins from the meme-token category
 */
async function fetchMemeCategory(limit: number): Promise<MemeCoin[]> {
  const data = await cgFetch<CoinGeckoMarketCoin[]>('/coins/markets', {
    vs_currency: 'usd',
    category: 'meme-token',
    order: 'volume_desc',
    per_page: limit,
    page: 1,
  });

  if (!data || data.length === 0) {
    return [];
  }

  return mapToMemeCoins(data);
}

/**
 * Fetch top coins by market cap and filter for meme-like tokens
 */
async function fetchTopCoinsWithMemeFilter(limit: number): Promise<MemeCoin[]> {
  // Fetch more coins to have enough after filtering
  const data = await cgFetch<CoinGeckoMarketCoin[]>('/coins/markets', {
    vs_currency: 'usd',
    order: 'market_cap_desc',
    per_page: 250,
    page: 1,
  });

  if (!data || data.length === 0) {
    return [];
  }

  // Filter for meme-like tokens based on name/symbol
  const memeCoins = data.filter(coin => {
    const symbolLower = coin.symbol.toLowerCase();
    const nameLower = coin.name.toLowerCase();
    
    return MEME_KEYWORDS.some(keyword => 
      symbolLower.includes(keyword) || nameLower.includes(keyword)
    );
  });

  return mapToMemeCoins(memeCoins).slice(0, limit);
}

/**
 * Map CoinGecko market data to MemeCoin type
 */
function mapToMemeCoins(data: CoinGeckoMarketCoin[]): MemeCoin[] {
  return data
    .filter(coin => 
      coin.symbol && 
      coin.current_price !== null && 
      coin.current_price !== undefined
    )
    .map(coin => ({
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      priceUsd: coin.current_price!,
      marketCapUsd: coin.market_cap ?? null,
      priceChange24h: coin.price_change_percentage_24h ?? null,
    }));
}
