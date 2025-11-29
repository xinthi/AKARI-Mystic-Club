/**
 * MYST Price Utilities
 * 
 * Provides functions to get live TON/USD prices and calculate MYST values.
 * Uses the /api/price/ton endpoint which caches results for 60 seconds.
 * 
 * Constants:
 * - 1 USD = 50 MYST (MYST_PER_USD)
 * - MYST value is always calculated using live TON price
 */

import { MYST_PER_USD, USD_PER_MYST } from './myst-service';

// Re-export constants for convenience
export { MYST_PER_USD, USD_PER_MYST };

// Default fallback price if API call fails
const FALLBACK_TON_PRICE = 5.0;

// In-memory cache for server-side calls
let serverCachedPrice: number | null = null;
let serverCacheTimestamp: number = 0;
const SERVER_CACHE_TTL_MS = 30 * 1000; // 30 seconds for server-side

interface PriceResult {
  priceUsd: number;
  source: 'binance' | 'coingecko' | 'cache' | 'fallback' | 'env';
}

/**
 * Get live TON price in USD.
 * 
 * On server-side: calls the internal API or uses direct fetch with caching.
 * On client-side: calls /api/price/ton.
 * 
 * @param baseUrl - Optional base URL for server-side calls (e.g., from req headers)
 */
export async function getTonPriceUsd(baseUrl?: string): Promise<PriceResult> {
  // Check if we're on server-side
  const isServer = typeof window === 'undefined';

  if (isServer) {
    return getServerSideTonPrice();
  } else {
    return getClientSideTonPrice();
  }
}

/**
 * Server-side TON price fetch with caching.
 * Directly calls external APIs to avoid HTTP round-trip.
 */
async function getServerSideTonPrice(): Promise<PriceResult> {
  const now = Date.now();

  // Check server-side cache
  if (serverCachedPrice !== null && (now - serverCacheTimestamp) < SERVER_CACHE_TTL_MS) {
    return { priceUsd: serverCachedPrice, source: 'cache' };
  }

  // First check if env var is set (for backward compatibility)
  const envPrice = process.env.TON_PRICE_USD;
  if (envPrice) {
    const parsed = parseFloat(envPrice);
    if (!isNaN(parsed) && parsed > 0) {
      // If env is set, use it as fallback but still try to get live price
      // This allows overriding in development
    }
  }

  // Try Binance
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      'https://api.binance.com/api/v3/ticker/price?symbol=TONUSDT',
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const price = parseFloat(data.price);

      if (!isNaN(price) && price > 0) {
        serverCachedPrice = price;
        serverCacheTimestamp = now;
        return { priceUsd: price, source: 'binance' };
      }
    }
  } catch (e) {
    // Silently continue to fallback
  }

  // Try CoinGecko
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd',
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const price = data?.['the-open-network']?.usd;

      if (typeof price === 'number' && price > 0) {
        serverCachedPrice = price;
        serverCacheTimestamp = now;
        return { priceUsd: price, source: 'coingecko' };
      }
    }
  } catch (e) {
    // Silently continue to fallback
  }

  // Use cached value if available (even if stale)
  if (serverCachedPrice !== null) {
    return { priceUsd: serverCachedPrice, source: 'cache' };
  }

  // Check env fallback
  if (envPrice) {
    const parsed = parseFloat(envPrice);
    if (!isNaN(parsed) && parsed > 0) {
      return { priceUsd: parsed, source: 'env' };
    }
  }

  // Last resort
  return { priceUsd: FALLBACK_TON_PRICE, source: 'fallback' };
}

/**
 * Client-side TON price fetch via API.
 */
async function getClientSideTonPrice(): Promise<PriceResult> {
  try {
    const response = await fetch('/api/price/ton');
    const data = await response.json();

    if (data.ok && typeof data.priceUsd === 'number') {
      return {
        priceUsd: data.priceUsd,
        source: data.source || 'cache',
      };
    }
  } catch (e) {
    console.warn('[MystPrice] Client-side price fetch failed');
  }

  return { priceUsd: FALLBACK_TON_PRICE, source: 'fallback' };
}

/**
 * Get how many MYST you get per 1 TON at current price.
 */
export async function getMystPerTon(): Promise<number> {
  const { priceUsd } = await getTonPriceUsd();
  return priceUsd * MYST_PER_USD;
}

/**
 * Calculate TON amount for a given USD value.
 */
export async function getTonAmountForUsd(usdAmount: number): Promise<number> {
  const { priceUsd } = await getTonPriceUsd();
  return usdAmount / priceUsd;
}

/**
 * Calculate MYST amount for a given TON value.
 */
export async function getMystAmountForTon(tonAmount: number): Promise<number> {
  const { priceUsd } = await getTonPriceUsd();
  const usdValue = tonAmount * priceUsd;
  return usdValue * MYST_PER_USD;
}

/**
 * Calculate TON amount for a given MYST value.
 */
export async function getTonAmountForMyst(mystAmount: number): Promise<number> {
  const { priceUsd } = await getTonPriceUsd();
  const usdValue = mystAmount * USD_PER_MYST;
  return usdValue / priceUsd;
}

/**
 * Synchronous fallback for cases where async is not possible.
 * Uses cached value or env var.
 */
export function getTonPriceUsdSync(): number {
  // Try server cache first
  if (serverCachedPrice !== null) {
    return serverCachedPrice;
  }

  // Try env var
  const envPrice = process.env.TON_PRICE_USD;
  if (envPrice) {
    const parsed = parseFloat(envPrice);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return FALLBACK_TON_PRICE;
}

/**
 * Get price with metadata for display purposes.
 */
export async function getTonPriceWithMeta(): Promise<{
  priceUsd: number;
  source: string;
  mystPerTon: number;
  usdPerMyst: number;
}> {
  const { priceUsd, source } = await getTonPriceUsd();
  
  return {
    priceUsd,
    source,
    mystPerTon: priceUsd * MYST_PER_USD,
    usdPerMyst: USD_PER_MYST,
  };
}

