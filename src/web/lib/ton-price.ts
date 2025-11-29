/**
 * TON Price Service
 * 
 * Fetches live TON/USD price from Binance (primary) or CoinGecko (secondary).
 * Uses a conservative fallback if all APIs fail to prevent over-crediting.
 */

// ============================================
// CACHE
// ============================================

let cachedTonPriceUsd: number | null = null;
let cachedAt: number | null = null;
const CACHE_TTL_MS = 60_000; // 60 seconds

// ============================================
// FALLBACK CONFIGURATION
// ============================================

// Fallback TON price (USD) used only if all live providers fail.
// Keep this CONSERVATIVE (e.g. 1.0) so we never over-credit deposits.
function getFallbackTonPrice(): number {
  if (typeof process.env.TON_PRICE_USD_FALLBACK === 'string') {
    const parsed = Number(process.env.TON_PRICE_USD_FALLBACK);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 1.0; // Conservative default
}

// ============================================
// API FETCHERS
// ============================================

/**
 * Fetch TON price from Binance (primary source)
 */
async function fetchFromBinance(): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      'https://api.binance.com/api/v3/ticker/price?symbol=TONUSDT',
      { method: 'GET', signal: controller.signal }
    );

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn('[TON] Binance returned non-OK status:', res.status, res.statusText);
      return null;
    }

    const data = (await res.json()) as { symbol: string; price: string };
    const price = parseFloat(data.price);

    if (!Number.isFinite(price) || price <= 0) {
      console.warn('[TON] Invalid price from Binance:', data.price);
      return null;
    }

    return price;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.warn('[TON] Binance fetch failed:', message);
    return null;
  }
}

/**
 * Fetch TON price from CoinGecko (secondary source)
 */
async function fetchFromCoinGecko(): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd',
      { method: 'GET', signal: controller.signal }
    );

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn('[TON] CoinGecko returned non-OK status:', res.status, res.statusText);
      return null;
    }

    const data = (await res.json()) as { 'the-open-network'?: { usd?: number } };
    const price = data?.['the-open-network']?.usd;

    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      console.warn('[TON] Invalid price from CoinGecko:', price);
      return null;
    }

    return price;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.warn('[TON] CoinGecko fetch failed:', message);
    return null;
  }
}

// ============================================
// MAIN EXPORT
// ============================================

/**
 * Get live TON price in USD.
 * 
 * Order of priority:
 * 1. Return cached value if still fresh (< 60 seconds old)
 * 2. Try Binance API
 * 3. Try CoinGecko API (if Binance fails)
 * 4. Use conservative fallback (default 1.0 USD) if all APIs fail
 * 
 * @returns TON price in USD
 */
export async function getTonPriceUsd(): Promise<number> {
  const now = Date.now();

  // 1. Return cached value if still fresh
  if (cachedTonPriceUsd !== null && cachedAt !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedTonPriceUsd;
  }

  // 2. Try Binance (primary)
  const binancePrice = await fetchFromBinance();
  if (binancePrice !== null) {
    cachedTonPriceUsd = binancePrice;
    cachedAt = now;
    return binancePrice;
  }

  // 3. Try CoinGecko (secondary)
  const coingeckoPrice = await fetchFromCoinGecko();
  if (coingeckoPrice !== null) {
    cachedTonPriceUsd = coingeckoPrice;
    cachedAt = now;
    return coingeckoPrice;
  }

  // 4. All APIs failed - use fallback
  const fallbackPrice = getFallbackTonPrice();
  console.warn(
    `[TON] Using fallback TON price: ${fallbackPrice} USD (live price fetch failed)`
  );

  // Don't cache fallback - we want to retry on next request
  return fallbackPrice;
}
