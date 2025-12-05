/**
 * DEX Enrichment Service
 * 
 * Aggregates DEX market data from multiple sources:
 * - DexScreener (primary)
 * - GeckoTerminal (secondary)
 * - Birdeye (Solana-specific, requires API key)
 * 
 * Server-side only - not for client components.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types (matching Prisma DexMarketSnapshot minus id/createdAt)
// ─────────────────────────────────────────────────────────────────────────────

export type DexSnapshotInput = {
  symbol: string | null;
  name: string | null;
  source: string;          // "dex_aggregator_v1"
  chain: string | null;    // "solana", "ethereum", etc.
  dex: string | null;      // "dexscreener", "geckoterminal", "birdeye"
  pairAddress: string | null;
  tokenAddress: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  txns24h: number | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEXSCREENER_BASE = 'https://api.dexscreener.com/latest/dex';
const GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';
const BIRDEYE_BASE = 'https://public-api.birdeye.so/public';

const SOURCE = 'dex_aggregator_v1';

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
      console.error(`[dexEnrichment] HTTP error ${resp.status} for ${url}`);
      return null;
    }

    return await resp.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[dexEnrichment] Timeout for ${url}`);
    } else {
      console.error(`[dexEnrichment] Fetch error for ${url}:`, err.message);
    }
    return null;
  }
}

/**
 * Normalize chain name to lowercase standard format
 */
function normalizeChain(chain?: string): string | null {
  if (!chain) return null;
  const lower = chain.toLowerCase();
  const mapping: Record<string, string> = {
    eth: 'ethereum',
    sol: 'solana',
    bsc: 'bsc',
    binance: 'bsc',
    polygon: 'polygon',
    arbitrum: 'arbitrum',
    optimism: 'optimism',
    avalanche: 'avalanche',
    base: 'base',
  };
  return mapping[lower] || lower;
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
// DexScreener Integration
// ─────────────────────────────────────────────────────────────────────────────

interface DexScreenerPair {
  chainId: string;
  dexId?: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    symbol: string;
  };
  priceUsd?: string;
  volume?: {
    h24?: number;
  };
  liquidity?: {
    usd?: number;
  };
  txns?: {
    h24?: {
      buys?: number;
      sells?: number;
    };
  };
}

interface DexScreenerResponse {
  pairs?: DexScreenerPair[];
}

/**
 * Fetch top pairs from DexScreener using search
 */
async function fetchDexScreenerPairs(): Promise<DexSnapshotInput[]> {
  console.log('[dexEnrichment] Fetching DexScreener pairs...');
  const results: DexSnapshotInput[] = [];

  // Search for popular quote tokens to get active pairs
  const searchTerms = ['USDT', 'SOL', 'ETH', 'USDC'];

  for (const term of searchTerms) {
    const url = `${DEXSCREENER_BASE}/search?q=${term}`;
    const data = await safeFetch<DexScreenerResponse>(url);

    if (!data?.pairs || !Array.isArray(data.pairs)) {
      console.log(`[dexEnrichment] DexScreener: no pairs for search "${term}"`);
      continue;
    }

    // Take top pairs by liquidity
    const topPairs = data.pairs
      .filter(p => p.liquidity?.usd && p.liquidity.usd > 10000)
      .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))
      .slice(0, 15);

    for (const p of topPairs) {
      const txns24h = p.txns?.h24 ? (p.txns.h24.buys || 0) + (p.txns.h24.sells || 0) : null;

      results.push({
        symbol: p.baseToken?.symbol?.toUpperCase() || null,
        name: p.baseToken?.name || null,
        source: SOURCE,
        chain: normalizeChain(p.chainId),
        dex: 'dexscreener',
        pairAddress: p.pairAddress || null,
        tokenAddress: p.baseToken?.address || null,
        priceUsd: safeNumber(p.priceUsd),
        liquidityUsd: safeNumber(p.liquidity?.usd),
        volume24hUsd: safeNumber(p.volume?.h24),
        txns24h,
      });
    }
  }

  console.log(`[dexEnrichment] DexScreener: found ${results.length} pairs`);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// GeckoTerminal Integration
// ─────────────────────────────────────────────────────────────────────────────

interface GeckoTerminalPool {
  id: string;
  type: string;
  attributes: {
    name?: string;
    address?: string;
    base_token_price_usd?: string;
    reserve_in_usd?: string;
    volume_usd?: {
      h24?: string;
    };
    transactions?: {
      h24?: {
        buys?: number;
        sells?: number;
      };
    };
  };
  relationships?: {
    base_token?: {
      data?: {
        id?: string;
      };
    };
  };
}

interface GeckoTerminalResponse {
  data?: GeckoTerminalPool[];
}

/**
 * Fetch trending pools from GeckoTerminal
 */
async function fetchGeckoTerminalPools(): Promise<DexSnapshotInput[]> {
  console.log('[dexEnrichment] Fetching GeckoTerminal trending pools...');
  const results: DexSnapshotInput[] = [];

  // Fetch trending pools for major networks
  const networks = ['solana', 'eth', 'base'];

  for (const network of networks) {
    const url = `${GECKOTERMINAL_BASE}/networks/${network}/trending_pools?page=1`;
    const data = await safeFetch<GeckoTerminalResponse>(url);

    if (!data?.data || !Array.isArray(data.data)) {
      console.log(`[dexEnrichment] GeckoTerminal: no pools for ${network}`);
      continue;
    }

    for (const pool of data.data.slice(0, 10)) {
      const attr = pool.attributes;
      if (!attr) continue;

      // Parse pool name to get symbol (format: "TOKEN / QUOTE")
      const nameParts = (attr.name || '').split('/').map(s => s.trim());
      const symbol = nameParts[0] || null;

      const txns24h = attr.transactions?.h24
        ? (attr.transactions.h24.buys || 0) + (attr.transactions.h24.sells || 0)
        : null;

      results.push({
        symbol: symbol?.toUpperCase() || null,
        name: attr.name || null,
        source: SOURCE,
        chain: normalizeChain(network),
        dex: 'geckoterminal',
        pairAddress: attr.address || null,
        tokenAddress: null, // GeckoTerminal doesn't always give token address directly
        priceUsd: safeNumber(attr.base_token_price_usd),
        liquidityUsd: safeNumber(attr.reserve_in_usd),
        volume24hUsd: safeNumber(attr.volume_usd?.h24),
        txns24h,
      });
    }
  }

  console.log(`[dexEnrichment] GeckoTerminal: found ${results.length} pools`);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Birdeye Integration (Solana-specific)
// ─────────────────────────────────────────────────────────────────────────────

interface BirdeyeTokenPrice {
  address: string;
  symbol?: string;
  name?: string;
  value?: number;
  liquidity?: number;
  v24hUSD?: number;
}

interface BirdeyePriceResponse {
  success: boolean;
  data?: Record<string, BirdeyeTokenPrice>;
}

/**
 * Fetch Solana token prices from Birdeye (if API key available)
 */
async function fetchBirdeyePrices(): Promise<DexSnapshotInput[]> {
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) {
    console.log('[dexEnrichment] Birdeye: BIRDEYE_API_KEY not set, skipping');
    return [];
  }

  console.log('[dexEnrichment] Fetching Birdeye Solana prices...');

  // Popular Solana token addresses
  const addresses = [
    'So11111111111111111111111111111111111111112', // SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
    'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', // WIF
  ];

  const url = `${BIRDEYE_BASE}/multi_price?list_address=${addresses.join(',')}`;
  const data = await safeFetch<BirdeyePriceResponse>(url, {
    headers: {
      'X-API-KEY': apiKey,
    },
  });

  if (!data?.success || !data.data) {
    console.log('[dexEnrichment] Birdeye: no data returned');
    return [];
  }

  const results: DexSnapshotInput[] = [];

  for (const [address, token] of Object.entries(data.data)) {
    if (!token) continue;

    results.push({
      symbol: token.symbol?.toUpperCase() || null,
      name: token.name || null,
      source: SOURCE,
      chain: 'solana',
      dex: 'birdeye',
      pairAddress: null,
      tokenAddress: address,
      priceUsd: safeNumber(token.value),
      liquidityUsd: safeNumber(token.liquidity),
      volume24hUsd: safeNumber(token.v24hUSD),
      txns24h: null,
    });
  }

  console.log(`[dexEnrichment] Birdeye: found ${results.length} tokens`);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Export Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch aggregated DEX snapshots from multiple sources.
 * Returns a deduplicated array sorted by liquidity.
 */
export async function fetchDexSnapshots(limit = 50): Promise<DexSnapshotInput[]> {
  console.log(`[dexEnrichment] fetchDexSnapshots: starting aggregation (limit=${limit})`);

  try {
    // Fetch from all sources in parallel
    const [dexScreenerData, geckoData, birdeyeData] = await Promise.all([
      fetchDexScreenerPairs().catch(e => {
        console.error('[dexEnrichment] DexScreener fetch failed:', e);
        return [];
      }),
      fetchGeckoTerminalPools().catch(e => {
        console.error('[dexEnrichment] GeckoTerminal fetch failed:', e);
        return [];
      }),
      fetchBirdeyePrices().catch(e => {
        console.error('[dexEnrichment] Birdeye fetch failed:', e);
        return [];
      }),
    ]);

    // Combine all results
    const allResults = [...dexScreenerData, ...geckoData, ...birdeyeData];
    console.log(`[dexEnrichment] Total raw results: ${allResults.length}`);

    if (allResults.length === 0) {
      console.log('[dexEnrichment] No data from any source');
      return [];
    }

    // Deduplicate by symbol+chain, keeping highest liquidity
    const deduped = new Map<string, DexSnapshotInput>();

    for (const item of allResults) {
      if (!item.symbol) continue;

      const key = `${item.symbol}-${item.chain || 'unknown'}`;
      const existing = deduped.get(key);

      if (!existing || (item.liquidityUsd || 0) > (existing.liquidityUsd || 0)) {
        deduped.set(key, item);
      }
    }

    // Sort by liquidity descending and limit
    const sorted = Array.from(deduped.values())
      .sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0))
      .slice(0, limit);

    console.log(`[dexEnrichment] fetchDexSnapshots: returning ${sorted.length} deduplicated results`);
    return sorted;
  } catch (error) {
    console.error('[dexEnrichment] fetchDexSnapshots exception:', error);
    return [];
  }
}

