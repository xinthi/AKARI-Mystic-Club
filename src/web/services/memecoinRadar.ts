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
 * Falls back through multiple strategies to ensure data is always returned:
 * 1. Pump.fun category
 * 2. meme-token category
 * 3. Keyword filtering from top coins
 * 4. Top coins by market cap (guaranteed fallback)
 */
export async function getTopPumpFunMemecoins(limit: number = 10): Promise<MemeCoin[]> {
  try {
    console.log('[memecoinRadar] getTopPumpFunMemecoins starting, limit:', limit);
    
    // Step 1: Try the Pump.fun category
    let result = await fetchPumpFunCoins(limit);
    console.log('[memecoinRadar] Pump.fun markets length:', result.length);
    
    if (result.length > 0) {
      const finalResult = result.slice(0, limit);
      console.log('[memecoinRadar] getTopPumpFunMemecoins final result length:', finalResult.length);
      return finalResult;
    }
      
    // Step 2: Fallback - try meme-token category
    console.log('[memecoinRadar] Pump.fun empty, trying meme-token category...');
    result = await fetchMemeCategory(limit);
    console.log('[memecoinRadar] meme-token markets length:', result.length);
    
    if (result.length > 0) {
      const finalResult = result.slice(0, limit);
      console.log('[memecoinRadar] getTopPumpFunMemecoins final result length:', finalResult.length);
      return finalResult;
    }
    
    // Step 3: Fallback - keyword filter from top coins
    console.log('[memecoinRadar] meme-token empty, trying keyword filter fallback...');
    result = await fetchTopCoinsWithMemeFilter(limit);
    console.log('[memecoinRadar] keyword-filtered memes length:', result.length);
    
    if (result.length > 0) {
      const finalResult = result.slice(0, limit);
      console.log('[memecoinRadar] getTopPumpFunMemecoins final result length:', finalResult.length);
      return finalResult;
    }
    
    // Step 4: Final fallback - just return top coins by market cap
    console.log('[memecoinRadar] keyword filter empty, falling back to top coins as memes');
    result = await fetchTopCoinsAsFallback(limit);
    console.log('[memecoinRadar] top coins fallback length:', result.length);

    const finalResult = result.slice(0, limit);
    console.log('[memecoinRadar] getTopPumpFunMemecoins final result length:', finalResult.length);
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
    console.log('[memecoinRadar] fetchPumpFunCoins: category pump-fun returned empty or null');
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
    console.log('[memecoinRadar] fetchMemeCategory: category meme-token returned empty or null');
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
    console.log('[memecoinRadar] fetchTopCoinsWithMemeFilter: /coins/markets returned empty or null');
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

  console.log('[memecoinRadar] fetchTopCoinsWithMemeFilter: found', memeCoins.length, 'meme-like coins from', data.length, 'total');

  if (memeCoins.length > 0) {
    return mapToMemeCoins(memeCoins).slice(0, limit);
  }

  // If no meme coins found via keywords, return empty (next fallback will handle it)
  return [];
}

/**
 * Final fallback: fetch top coins by market cap and return them directly as "memes"
 * This guarantees we always have something to display if CoinGecko is working
 */
async function fetchTopCoinsAsFallback(limit: number): Promise<MemeCoin[]> {
  const data = await cgFetch<CoinGeckoMarketCoin[]>('/coins/markets', {
    vs_currency: 'usd',
    order: 'market_cap_desc',
    per_page: limit,
    page: 1,
  });

  if (!data || data.length === 0) {
    console.log('[memecoinRadar] fetchTopCoinsAsFallback: /coins/markets returned empty or null');
    return [];
  }

  // Map top coins directly to MemeCoin type (no filtering)
  return mapToMemeCoins(data);
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
