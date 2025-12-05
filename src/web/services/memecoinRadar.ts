/**
 * Meme Coin Radar Service
 * 
 * Fetches top memecoins from CoinGecko API with multiple fallback strategies:
 * 1. Try category=meme-token
 * 2. Try category=pump-fun
 * 3. Fallback to top coins by volume filtered by meme keywords
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

// Known meme coin symbols/keywords for filtering
const MEME_KEYWORDS = [
  'pepe', 'doge', 'shib', 'wif', 'bonk', 'floki', 'meme', 'inu',
  'elon', 'moon', 'wojak', 'chad', 'frog', 'cat', 'dog', 'pump',
  'brett', 'popcat', 'mog', 'turbo', 'neiro', 'goat', 'pnut',
  'act', 'bome', 'myro', 'slerf', 'wen', 'book', 'samo', 'corgiai',
  'cate', 'ai16z', 'zerebro', 'griffain', 'virtual', 'fartcoin'
];

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempt to fetch memecoins from a specific CoinGecko category.
 * Returns empty array if category doesn't exist or has no data.
 */
async function fetchCategory(category: string, limit: number): Promise<MemeCoin[]> {
  try {
    console.log('[memecoinRadar] fetchCategory:', category, 'limit:', limit);
    
    const data = await cgFetch<CoinGeckoMarketCoin[]>('/coins/markets', {
      vs_currency: 'usd',
      category,
      order: 'market_cap_desc',
      per_page: limit,
      page: 1,
    });

    if (!Array.isArray(data) || data.length === 0) {
      console.log('[memecoinRadar] fetchCategory', category, ': empty result');
      return [];
    }

    console.log('[memecoinRadar] fetchCategory', category, ': got', data.length, 'coins');
    return mapToMemeCoins(data);
  } catch (error) {
    console.error('[memecoinRadar] fetchCategory', category, 'exception:', error);
    return [];
  }
}

/**
 * Fetch top coins by volume and filter by meme keywords.
 * This is the most reliable fallback since it doesn't depend on CoinGecko categories.
 */
async function fetchByVolumeWithKeywordFilter(limit: number): Promise<MemeCoin[]> {
  try {
    console.log('[memecoinRadar] fetchByVolumeWithKeywordFilter: fetching top 250 by volume');

    const data = await cgFetch<CoinGeckoMarketCoin[]>('/coins/markets', {
      vs_currency: 'usd',
      order: 'volume_desc',
      per_page: 250,
      page: 1,
    });

    if (!Array.isArray(data) || data.length === 0) {
      console.log('[memecoinRadar] fetchByVolumeWithKeywordFilter: API returned empty');
      return [];
    }

    console.log('[memecoinRadar] fetchByVolumeWithKeywordFilter: API returned', data.length, 'coins');

    // Filter for meme-like tokens based on name/symbol keywords
    const memeCandidates = data.filter(coin => {
      const symbolLower = coin.symbol.toLowerCase();
      const nameLower = coin.name.toLowerCase();
      return MEME_KEYWORDS.some(keyword =>
        symbolLower.includes(keyword) || nameLower.includes(keyword)
      );
    });

    console.log('[memecoinRadar] fetchByVolumeWithKeywordFilter: keyword matches =', memeCandidates.length);

    const mapped = mapToMemeCoins(memeCandidates);
    return mapped.slice(0, limit);
  } catch (error) {
    console.error('[memecoinRadar] fetchByVolumeWithKeywordFilter exception:', error);
    return [];
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// Exported Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get top memecoins from CoinGecko with multiple fallback strategies.
 * Returns up to the specified limit (default: 10).
 * 
 * Strategies (in order):
 * 1. category=meme-token
 * 2. category=pump-fun
 * 3. Top coins by volume, filtered by meme keywords
 * 
 * Always returns an array (possibly empty), never throws.
 */
export async function getTopPumpFunMemecoins(limit: number = 10): Promise<MemeCoin[]> {
  console.log('[memecoinRadar] getTopPumpFunMemecoins: limit =', limit);

  // Strategy 1: Try meme-token category
  let result = await fetchCategory('meme-token', limit);
  if (result.length > 0) {
    console.log('[memecoinRadar] getTopPumpFunMemecoins: Strategy 1 (meme-token) succeeded with', result.length, 'coins');
    return result;
  }

  // Strategy 2: Try pump-fun category
  result = await fetchCategory('pump-fun', limit);
  if (result.length > 0) {
    console.log('[memecoinRadar] getTopPumpFunMemecoins: Strategy 2 (pump-fun) succeeded with', result.length, 'coins');
    return result;
  }

  // Strategy 3: Fallback to volume + keyword filter
  result = await fetchByVolumeWithKeywordFilter(limit);
  if (result.length > 0) {
    console.log('[memecoinRadar] getTopPumpFunMemecoins: Strategy 3 (volume+keywords) succeeded with', result.length, 'coins');
    return result;
  }

  console.log('[memecoinRadar] getTopPumpFunMemecoins: All strategies exhausted, returning empty array');
  return [];
}

/**
 * Direct meme fetch using volume + keyword filter only.
 * Used as a last-resort fallback by cron handlers.
 */
export async function fetchMemesDirectly(limit: number = 20): Promise<MemeCoin[]> {
  console.log('[memecoinRadar] fetchMemesDirectly: direct keyword-based fetch, limit =', limit);
  return fetchByVolumeWithKeywordFilter(limit);
}
