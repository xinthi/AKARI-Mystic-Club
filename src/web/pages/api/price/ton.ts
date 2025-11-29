/**
 * TON Price Oracle API
 * 
 * GET /api/price/ton
 * 
 * Fetches live TON/USD price from Binance (primary) or CoinGecko (fallback).
 * Results are cached in-memory for 60 seconds.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

interface PriceResponse {
  ok: boolean;
  priceUsd?: number;
  source?: 'binance' | 'coingecko' | 'cache' | 'fallback';
  cachedAt?: string;
  message?: string;
}

// In-memory cache
let cachedPrice: number | null = null;
let cachedSource: 'binance' | 'coingecko' = 'binance';
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// Fallback price if all APIs fail
const FALLBACK_PRICE = 5.0;

/**
 * Fetch TON price from Binance
 */
async function fetchFromBinance(): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      'https://api.binance.com/api/v3/ticker/price?symbol=TONUSDT',
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn('[PriceOracle] Binance returned non-OK status:', response.status);
      return null;
    }

    const data = await response.json();
    const price = parseFloat(data.price);

    if (isNaN(price) || price <= 0) {
      console.warn('[PriceOracle] Invalid price from Binance:', data.price);
      return null;
    }

    return price;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[PriceOracle] Binance fetch failed:', message);
    return null;
  }
}

/**
 * Fetch TON price from CoinGecko
 */
async function fetchFromCoinGecko(): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd',
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn('[PriceOracle] CoinGecko returned non-OK status:', response.status);
      return null;
    }

    const data = await response.json();
    const price = data?.['the-open-network']?.usd;

    if (typeof price !== 'number' || price <= 0) {
      console.warn('[PriceOracle] Invalid price from CoinGecko:', price);
      return null;
    }

    return price;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[PriceOracle] CoinGecko fetch failed:', message);
    return null;
  }
}

/**
 * Get TON price with caching and fallback
 */
async function getTonPrice(): Promise<{ price: number; source: 'binance' | 'coingecko' | 'cache' | 'fallback' }> {
  const now = Date.now();

  // Check cache
  if (cachedPrice !== null && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return { price: cachedPrice, source: 'cache' };
  }

  // Try Binance first
  const binancePrice = await fetchFromBinance();
  if (binancePrice !== null) {
    cachedPrice = binancePrice;
    cachedSource = 'binance';
    cacheTimestamp = now;
    return { price: binancePrice, source: 'binance' };
  }

  // Fallback to CoinGecko
  const coingeckoPrice = await fetchFromCoinGecko();
  if (coingeckoPrice !== null) {
    cachedPrice = coingeckoPrice;
    cachedSource = 'coingecko';
    cacheTimestamp = now;
    return { price: coingeckoPrice, source: 'coingecko' };
  }

  // If all APIs fail, return cached value if any (even if stale)
  if (cachedPrice !== null) {
    console.warn('[PriceOracle] All APIs failed, returning stale cache');
    return { price: cachedPrice, source: 'cache' };
  }

  // Last resort: fallback price
  console.warn('[PriceOracle] All APIs failed and no cache, using fallback price');
  return { price: FALLBACK_PRICE, source: 'fallback' };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PriceResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    const { price, source } = await getTonPrice();

    return res.status(200).json({
      ok: true,
      priceUsd: price,
      source,
      cachedAt: cacheTimestamp > 0 ? new Date(cacheTimestamp).toISOString() : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PriceOracle] Handler error:', message);
    
    // Even on error, try to return fallback
    return res.status(200).json({
      ok: true,
      priceUsd: FALLBACK_PRICE,
      source: 'fallback',
      message: 'Using fallback price due to error',
    });
  }
}

// Export for internal use
export { getTonPrice, FALLBACK_PRICE };

