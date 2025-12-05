/**
 * CEX Enrichment Service
 * 
 * Aggregates CEX market data from multiple exchanges:
 * - Binance (primary)
 * - OKX (secondary)
 * - KuCoin (tertiary)
 * 
 * Server-side only - not for client components.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types (matching Prisma CexMarketSnapshot minus id/createdAt)
// ─────────────────────────────────────────────────────────────────────────────

export type CexSnapshotInput = {
  symbol: string;           // "BTC"
  baseAsset: string | null; // "BTC"
  quoteAsset: string | null; // "USDT"
  source: string;           // "cex_aggregator_v1"
  priceUsd: number | null;
  volume24hUsd: number | null;
  openInterestUsd: number | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BINANCE_BASE = 'https://api.binance.com/api/v3';
const OKX_BASE = 'https://www.okx.com/api/v5';
const KUCOIN_BASE = 'https://api.kucoin.com/api/v1';

const SOURCE = 'cex_aggregator_v1';

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safe fetch wrapper with timeout and error handling
 */
async function safeFetch<T>(
  url: string,
  options?: RequestInit,
  timeoutMs: number = 15000
): Promise<T | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...options?.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      console.error(`[cexEnrichment] HTTP error ${resp.status} for ${url}`);
      return null;
    }

    return await resp.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[cexEnrichment] Timeout for ${url}`);
    } else {
      console.error(`[cexEnrichment] Fetch error for ${url}:`, err.message);
    }
    return null;
  }
}

/**
 * Parse a number safely
 */
function safeNumber(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

// ─────────────────────────────────────────────────────────────────────────────
// Binance Integration
// ─────────────────────────────────────────────────────────────────────────────

interface BinanceTicker {
  symbol: string;           // "BTCUSDT"
  lastPrice: string;
  volume: string;           // Base asset volume
  quoteVolume: string;      // Quote asset volume (USDT)
  priceChangePercent: string;
}

/**
 * Fetch Binance 24h tickers
 */
async function fetchBinanceTickers(): Promise<CexSnapshotInput[]> {
  console.log('[cexEnrichment] Fetching Binance tickers...');

  const url = `${BINANCE_BASE}/ticker/24hr`;
  const data = await safeFetch<BinanceTicker[]>(url);

  if (!data || !Array.isArray(data)) {
    console.log('[cexEnrichment] Binance: no data returned');
    return [];
  }

  // Filter for USDT pairs with significant volume
  const usdtPairs = data
    .filter(t => t.symbol.endsWith('USDT') && parseFloat(t.quoteVolume) > 100000)
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    .slice(0, 50);

  const results: CexSnapshotInput[] = [];

  for (const ticker of usdtPairs) {
    const baseSymbol = ticker.symbol.replace('USDT', '');

    results.push({
      symbol: baseSymbol,
      baseAsset: baseSymbol,
      quoteAsset: 'USDT',
      source: SOURCE,
      priceUsd: safeNumber(ticker.lastPrice),
      volume24hUsd: safeNumber(ticker.quoteVolume),
      openInterestUsd: null,
    });
  }

  console.log(`[cexEnrichment] Binance: found ${results.length} USDT pairs`);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// OKX Integration
// ─────────────────────────────────────────────────────────────────────────────

interface OKXTicker {
  instId: string;         // "BTC-USDT"
  last: string;           // Last price
  vol24h: string;         // 24h volume in base currency
  volCcy24h: string;      // 24h volume in quote currency
}

interface OKXResponse {
  code: string;
  msg: string;
  data?: OKXTicker[];
}

/**
 * Fetch OKX spot tickers
 */
async function fetchOKXTickers(): Promise<CexSnapshotInput[]> {
  console.log('[cexEnrichment] Fetching OKX tickers...');

  const url = `${OKX_BASE}/market/tickers?instType=SPOT`;
  const data = await safeFetch<OKXResponse>(url);

  if (!data?.data || !Array.isArray(data.data)) {
    console.log('[cexEnrichment] OKX: no data returned');
    return [];
  }

  // Filter for USDT pairs with significant volume
  const usdtPairs = data.data
    .filter(t => t.instId.endsWith('-USDT') && parseFloat(t.volCcy24h) > 100000)
    .sort((a, b) => parseFloat(b.volCcy24h) - parseFloat(a.volCcy24h))
    .slice(0, 50);

  const results: CexSnapshotInput[] = [];

  for (const ticker of usdtPairs) {
    const [baseSymbol] = ticker.instId.split('-');

    results.push({
      symbol: baseSymbol,
      baseAsset: baseSymbol,
      quoteAsset: 'USDT',
      source: SOURCE,
      priceUsd: safeNumber(ticker.last),
      volume24hUsd: safeNumber(ticker.volCcy24h),
      openInterestUsd: null,
    });
  }

  console.log(`[cexEnrichment] OKX: found ${results.length} USDT pairs`);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// KuCoin Integration
// ─────────────────────────────────────────────────────────────────────────────

interface KuCoinTicker {
  symbol: string;         // "BTC-USDT"
  last: string;           // Last price
  vol: string;            // 24h volume in base currency
  volValue: string;       // 24h volume in quote currency
}

interface KuCoinResponse {
  code: string;
  data?: {
    ticker: KuCoinTicker[];
  };
}

/**
 * Fetch KuCoin all tickers
 */
async function fetchKuCoinTickers(): Promise<CexSnapshotInput[]> {
  console.log('[cexEnrichment] Fetching KuCoin tickers...');

  const url = `${KUCOIN_BASE}/market/allTickers`;
  const data = await safeFetch<KuCoinResponse>(url);

  if (!data?.data?.ticker || !Array.isArray(data.data.ticker)) {
    console.log('[cexEnrichment] KuCoin: no data returned');
    return [];
  }

  // Filter for USDT pairs with significant volume
  const usdtPairs = data.data.ticker
    .filter(t => t.symbol.endsWith('-USDT') && parseFloat(t.volValue) > 100000)
    .sort((a, b) => parseFloat(b.volValue) - parseFloat(a.volValue))
    .slice(0, 50);

  const results: CexSnapshotInput[] = [];

  for (const ticker of usdtPairs) {
    const [baseSymbol] = ticker.symbol.split('-');

    results.push({
      symbol: baseSymbol,
      baseAsset: baseSymbol,
      quoteAsset: 'USDT',
      source: SOURCE,
      priceUsd: safeNumber(ticker.last),
      volume24hUsd: safeNumber(ticker.volValue),
      openInterestUsd: null,
    });
  }

  console.log(`[cexEnrichment] KuCoin: found ${results.length} USDT pairs`);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Export Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch aggregated CEX snapshots from multiple exchanges.
 * Returns a deduplicated array sorted by volume.
 */
export async function fetchCexSnapshots(limit = 50): Promise<CexSnapshotInput[]> {
  console.log(`[cexEnrichment] fetchCexSnapshots: starting aggregation (limit=${limit})`);

  try {
    // Fetch from all exchanges in parallel
    const [binanceData, okxData, kucoinData] = await Promise.all([
      fetchBinanceTickers().catch(e => {
        console.error('[cexEnrichment] Binance fetch failed:', e);
        return [];
      }),
      fetchOKXTickers().catch(e => {
        console.error('[cexEnrichment] OKX fetch failed:', e);
        return [];
      }),
      fetchKuCoinTickers().catch(e => {
        console.error('[cexEnrichment] KuCoin fetch failed:', e);
        return [];
      }),
    ]);

    // Combine all results
    const allResults = [...binanceData, ...okxData, ...kucoinData];
    console.log(`[cexEnrichment] Total raw results: ${allResults.length}`);

    if (allResults.length === 0) {
      console.log('[cexEnrichment] No data from any exchange');
      return [];
    }

    // Deduplicate by symbol, keeping highest volume
    const deduped = new Map<string, CexSnapshotInput>();

    for (const item of allResults) {
      if (!item.symbol) continue;

      const existing = deduped.get(item.symbol);

      if (!existing || (item.volume24hUsd || 0) > (existing.volume24hUsd || 0)) {
        deduped.set(item.symbol, item);
      }
    }

    // Sort by volume descending and limit
    const sorted = Array.from(deduped.values())
      .sort((a, b) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0))
      .slice(0, limit);

    console.log(`[cexEnrichment] fetchCexSnapshots: returning ${sorted.length} deduplicated results`);
    return sorted;
  } catch (error) {
    console.error('[cexEnrichment] fetchCexSnapshots exception:', error);
    return [];
  }
}

