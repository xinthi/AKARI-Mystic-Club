/**
 * Meme Coin Radar Service
 * 
 * Fetches top memecoins from CoinGecko API by volume,
 * then filters for meme-like tokens using keyword matching.
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
  'act', 'bome', 'myro', 'slerf', 'wen', 'book', 'samo', 'corgiai'
];

// ─────────────────────────────────────────────────────────────────────────────
// Exported Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get top memecoins from CoinGecko by volume, filtered by meme keywords.
 * Returns up to the specified limit (default: 10).
 * 
 * Simplified implementation that:
 * 1. Fetches top 250 coins by volume
 * 2. Filters for meme-like tokens using keyword matching
 * 3. Returns the top `limit` results
 */
export async function getTopPumpFunMemecoins(limit: number = 10): Promise<MemeCoin[]> {
  try {
    console.log('[memecoinRadar] getTopPumpFunMemecoins: simple volume-based fetch, limit =', limit);

    const data = await cgFetch<CoinGeckoMarketCoin[]>('/coins/markets', {
      vs_currency: 'usd',
      order: 'volume_desc',
      per_page: 250,
      page: 1,
    });

    if (!Array.isArray(data) || data.length === 0) {
      console.log('[memecoinRadar] /coins/markets returned empty or not an array');
      return [];
    }

    console.log('[memecoinRadar] /coins/markets returned', data.length, 'coins');

    // Filter for meme-like tokens based on name/symbol keywords
    const memeCandidates = data.filter(coin => {
      const symbolLower = coin.symbol.toLowerCase();
      const nameLower = coin.name.toLowerCase();
      return MEME_KEYWORDS.some(keyword =>
        symbolLower.includes(keyword) || nameLower.includes(keyword)
      );
    });

    console.log('[memecoinRadar] memeCandidates length =', memeCandidates.length);

    const mapped = mapToMemeCoins(memeCandidates);
    const result = mapped.slice(0, limit);
    
    console.log('[memecoinRadar] getTopPumpFunMemecoins final result length =', result.length);
    return result;
  } catch (error) {
    console.error('[memecoinRadar] getTopPumpFunMemecoins exception:', error);
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
