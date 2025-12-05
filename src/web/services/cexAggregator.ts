/**
 * CEX Aggregator Service
 * 
 * Aggregates centralized exchange market data from:
 * - Binance (primary)
 * - OKX (secondary)
 * 
 * Server-side only - not for client components.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CexExchange = 'binance' | 'okx';

export type CexMarketInfo = {
  symbol: string;        // e.g. "BTC"
  baseSymbol: string;    // "BTC"
  quoteSymbol: string;   // "USDT"
  exchange: CexExchange;
  pairCode: string;      // "BTCUSDT" or "BTC-USDT"
  priceUsd?: number;
  volume24hUsd?: number;
  high24h?: number;
  low24h?: number;
  priceChange24h?: number; // percentage
  fundingRate?: number;    // for perpetual futures
  openInterestUsd?: number; // for futures
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BINANCE_BASE = 'https://api.binance.com/api/v3';
const BINANCE_FUTURES_BASE = 'https://fapi.binance.com/fapi/v1';
const OKX_BASE = 'https://www.okx.com/api/v5';

// Symbols that are likely to have USDT pairs on major CEXs
const MAJOR_SYMBOLS = new Set([
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'MATIC',
  'LINK', 'UNI', 'ATOM', 'LTC', 'ETC', 'NEAR', 'APT', 'ARB', 'OP', 'SUI',
  'TRX', 'SHIB', 'FIL', 'ICP', 'AAVE', 'MKR', 'GRT', 'INJ', 'TIA', 'SEI',
  'FET', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'RENDER', 'IMX', 'STX', 'RUNE',
  'WLD', 'JUP', 'PYTH', 'ONDO', 'PENDLE', 'ENS', 'LDO', 'RPL', 'CRV',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safe fetch wrapper with timeout and error handling
 */
async function safeFetch<T>(
  url: string,
  options?: RequestInit,
  timeoutMs: number = 10000
): Promise<T | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        ...options?.headers,
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!resp.ok) {
      console.error(`[cexAggregator] HTTP error ${resp.status} for ${url}`);
      return null;
    }
    
    return await resp.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[cexAggregator] Timeout for ${url}`);
    } else {
      console.error(`[cexAggregator] Fetch error for ${url}:`, err.message);
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Binance Integration
// ─────────────────────────────────────────────────────────────────────────────

interface BinanceTicker24h {
  symbol: string;           // "BTCUSDT"
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  lastPrice: string;
  lastQty: string;
  highPrice: string;
  lowPrice: string;
  volume: string;           // Base asset volume
  quoteVolume: string;      // Quote asset volume (USDT volume)
  openPrice: string;
  count: number;            // Number of trades
}

interface BinanceFundingRate {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
}

interface BinanceOpenInterest {
  symbol: string;
  openInterest: string;
  time: number;
}

/**
 * Fetch Binance spot ticker for multiple symbols
 */
async function fetchBinanceSpotTickers(symbols: string[]): Promise<CexMarketInfo[]> {
  console.log(`[cexAggregator] Binance spot: fetching ${symbols.length} symbols`);
  
  // Build USDT pairs
  const pairs = symbols
    .map(s => `${s.toUpperCase()}USDT`)
    .filter(p => p.length <= 20); // Binance symbol limit
  
  if (pairs.length === 0) {
    return [];
  }
  
  // Fetch all tickers at once (more efficient)
  const url = `${BINANCE_BASE}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(pairs))}`;
  const data = await safeFetch<BinanceTicker24h[]>(url);
  
  if (!data || !Array.isArray(data)) {
    console.log(`[cexAggregator] Binance spot: failed to fetch tickers`);
    return [];
  }
  
  console.log(`[cexAggregator] Binance spot: got ${data.length} tickers`);
  
  return data.map(ticker => {
    const baseSymbol = ticker.symbol.replace('USDT', '');
    return {
      symbol: baseSymbol,
      baseSymbol,
      quoteSymbol: 'USDT',
      exchange: 'binance' as CexExchange,
      pairCode: ticker.symbol,
      priceUsd: parseFloat(ticker.lastPrice),
      volume24hUsd: parseFloat(ticker.quoteVolume),
      high24h: parseFloat(ticker.highPrice),
      low24h: parseFloat(ticker.lowPrice),
      priceChange24h: parseFloat(ticker.priceChangePercent),
    };
  });
}

/**
 * Fetch Binance futures funding rates for symbols
 */
async function fetchBinanceFundingRates(symbols: string[]): Promise<Map<string, number>> {
  console.log(`[cexAggregator] Binance futures: fetching funding rates`);
  
  const url = `${BINANCE_FUTURES_BASE}/premiumIndex`;
  const data = await safeFetch<BinanceFundingRate[]>(url);
  
  const rates = new Map<string, number>();
  
  if (!data || !Array.isArray(data)) {
    console.log(`[cexAggregator] Binance futures: failed to fetch funding rates`);
    return rates;
  }
  
  // Filter to requested symbols
  const symbolSet = new Set(symbols.map(s => `${s.toUpperCase()}USDT`));
  
  for (const item of data) {
    if (symbolSet.has(item.symbol)) {
      const baseSymbol = item.symbol.replace('USDT', '');
      rates.set(baseSymbol, parseFloat(item.lastFundingRate) * 100); // Convert to percentage
    }
  }
  
  console.log(`[cexAggregator] Binance futures: got ${rates.size} funding rates`);
  return rates;
}

/**
 * Fetch Binance futures open interest for a single symbol
 */
async function fetchBinanceOpenInterest(symbol: string): Promise<number | null> {
  const pairCode = `${symbol.toUpperCase()}USDT`;
  const url = `${BINANCE_FUTURES_BASE}/openInterest?symbol=${pairCode}`;
  const data = await safeFetch<BinanceOpenInterest>(url);
  
  if (!data?.openInterest) {
    return null;
  }
  
  return parseFloat(data.openInterest);
}

// ─────────────────────────────────────────────────────────────────────────────
// OKX Integration
// ─────────────────────────────────────────────────────────────────────────────

interface OKXTicker {
  instId: string;         // "BTC-USDT"
  last: string;           // Last price
  lastSz: string;         // Last trade size
  askPx: string;          // Best ask price
  bidPx: string;          // Best bid price
  open24h: string;        // 24h open price
  high24h: string;        // 24h high
  low24h: string;         // 24h low
  vol24h: string;         // 24h volume in base currency
  volCcy24h: string;      // 24h volume in quote currency
  ts: string;             // Timestamp
}

interface OKXResponse {
  code: string;
  msg: string;
  data?: OKXTicker[];
}

/**
 * Fetch OKX spot tickers for multiple symbols
 */
async function fetchOKXSpotTickers(symbols: string[]): Promise<CexMarketInfo[]> {
  console.log(`[cexAggregator] OKX spot: fetching ${symbols.length} symbols`);
  
  const results: CexMarketInfo[] = [];
  
  // OKX API requires fetching one at a time or all at once
  // Let's fetch all and filter
  const url = `${OKX_BASE}/market/tickers?instType=SPOT`;
  const data = await safeFetch<OKXResponse>(url);
  
  if (!data?.data || !Array.isArray(data.data)) {
    console.log(`[cexAggregator] OKX spot: failed to fetch tickers`);
    return [];
  }
  
  // Filter to requested symbols with USDT quote
  const symbolSet = new Set(symbols.map(s => s.toUpperCase()));
  
  for (const ticker of data.data) {
    // OKX format: "BTC-USDT"
    const [base, quote] = ticker.instId.split('-');
    
    if (quote === 'USDT' && symbolSet.has(base)) {
      const price = parseFloat(ticker.last);
      const open24h = parseFloat(ticker.open24h);
      const priceChange24h = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;
      
      results.push({
        symbol: base,
        baseSymbol: base,
        quoteSymbol: 'USDT',
        exchange: 'okx' as CexExchange,
        pairCode: ticker.instId,
        priceUsd: price,
        volume24hUsd: parseFloat(ticker.volCcy24h),
        high24h: parseFloat(ticker.high24h),
        low24h: parseFloat(ticker.low24h),
        priceChange24h,
      });
    }
  }
  
  console.log(`[cexAggregator] OKX spot: found ${results.length} matching tickers`);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Export Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get CEX market data for a list of symbols.
 * Queries both Binance and OKX and returns aggregated results.
 */
export async function getCexMarketsForSymbols(
  symbols: string[]
): Promise<CexMarketInfo[]> {
  console.log(`[cexAggregator] getCexMarketsForSymbols: processing ${symbols.length} symbols`);
  
  // Normalize symbols and filter to those likely to have CEX pairs
  const normalizedSymbols = [...new Set(
    symbols
      .map(s => s.toUpperCase())
      .filter(s => MAJOR_SYMBOLS.has(s) || s.length <= 5) // Include short symbols
  )];
  
  if (normalizedSymbols.length === 0) {
    console.log(`[cexAggregator] No valid symbols to query`);
    return [];
  }
  
  console.log(`[cexAggregator] Querying for ${normalizedSymbols.length} normalized symbols`);
  
  // Fetch from both exchanges in parallel
  const [binanceSpot, okxSpot, binanceFundingRates] = await Promise.all([
    fetchBinanceSpotTickers(normalizedSymbols),
    fetchOKXSpotTickers(normalizedSymbols),
    fetchBinanceFundingRates(normalizedSymbols),
  ]);
  
  // Enrich Binance results with funding rates
  for (const ticker of binanceSpot) {
    const fundingRate = binanceFundingRates.get(ticker.symbol);
    if (fundingRate !== undefined) {
      ticker.fundingRate = fundingRate;
    }
  }
  
  const results = [...binanceSpot, ...okxSpot];
  
  console.log(`[cexAggregator] getCexMarketsForSymbols: returning ${results.length} results`);
  return results;
}

/**
 * Get CEX market data for a single symbol from all exchanges.
 */
export async function getCexMarketsForSymbol(symbol: string): Promise<CexMarketInfo[]> {
  return getCexMarketsForSymbols([symbol]);
}

/**
 * Get the best CEX price for a symbol (highest volume).
 */
export async function getBestCexMarketForSymbol(symbol: string): Promise<CexMarketInfo | null> {
  const results = await getCexMarketsForSymbol(symbol);
  
  if (results.length === 0) {
    return null;
  }
  
  // Return the one with highest volume
  return results.reduce((best, current) => {
    const bestVol = best.volume24hUsd || 0;
    const currentVol = current.volume24hUsd || 0;
    return currentVol > bestVol ? current : best;
  });
}

/**
 * Get major crypto prices from Binance (quick utility function).
 */
export async function getMajorCryptoPrices(): Promise<{ symbol: string; priceUsd: number; change24h: number }[]> {
  const majors = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
  const results = await fetchBinanceSpotTickers(majors);
  
  return results.map(r => ({
    symbol: r.symbol,
    priceUsd: r.priceUsd || 0,
    change24h: r.priceChange24h || 0,
  }));
}

/**
 * Get exchanges where a symbol trades (for "Where trading" display).
 */
export async function getExchangesForSymbol(symbol: string): Promise<string[]> {
  const results = await getCexMarketsForSymbol(symbol);
  return [...new Set(results.map(r => r.exchange))];
}

