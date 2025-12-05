/**
 * DEX Aggregator Service
 * 
 * Aggregates DEX market data from multiple sources:
 * - DexScreener (primary)
 * - GeckoTerminal (secondary)
 * - Birdeye (Solana-specific)
 * 
 * Server-side only - not for client components.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DexSource = 'dexscreener' | 'geckoterminal' | 'birdeye';

export type DexMarketInfo = {
  symbol: string;
  name?: string;
  chain: string;
  address: string;       // token or pair address
  pairAddress?: string;
  dexSource: DexSource;
  dexName?: string;      // e.g. "Raydium", "Uniswap"
  priceUsd?: number;
  liquidityUsd?: number;
  volume24hUsd?: number;
  fdvUsd?: number;
  baseToken?: string;
  quoteToken?: string;
  priceChange24h?: number;
  txns24h?: number;
};

export type TokenQuery = {
  symbol: string;
  chain?: string;   // "solana", "ethereum", "base", etc.
  address?: string; // token contract address
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEXSCREENER_BASE = 'https://api.dexscreener.com/latest/dex';
const GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';
const BIRDEYE_BASE = 'https://public-api.birdeye.so/public';

// Map common chain names to DexScreener chain IDs
const CHAIN_MAP: Record<string, string> = {
  'ethereum': 'ethereum',
  'eth': 'ethereum',
  'solana': 'solana',
  'sol': 'solana',
  'base': 'base',
  'bsc': 'bsc',
  'binance': 'bsc',
  'arbitrum': 'arbitrum',
  'polygon': 'polygon',
  'avalanche': 'avalanche',
  'optimism': 'optimism',
};

// Map chain names to GeckoTerminal network IDs
const GECKOTERMINAL_CHAIN_MAP: Record<string, string> = {
  'ethereum': 'eth',
  'eth': 'eth',
  'solana': 'solana',
  'sol': 'solana',
  'base': 'base',
  'bsc': 'bsc',
  'arbitrum': 'arbitrum_one',
  'polygon': 'polygon_pos',
  'avalanche': 'avax',
  'optimism': 'optimism',
};

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
      console.error(`[dexAggregator] HTTP error ${resp.status} for ${url}`);
      return null;
    }
    
    return await resp.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[dexAggregator] Timeout for ${url}`);
    } else {
      console.error(`[dexAggregator] Fetch error for ${url}:`, err.message);
    }
    return null;
  }
}

/**
 * Normalize chain name to a standard format
 */
function normalizeChain(chain?: string): string {
  if (!chain) return 'unknown';
  const lower = chain.toLowerCase();
  return CHAIN_MAP[lower] || lower;
}

// ─────────────────────────────────────────────────────────────────────────────
// DexScreener Integration
// ─────────────────────────────────────────────────────────────────────────────

interface DexScreenerPair {
  chainId: string;
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
  priceNative?: string;
  volume?: {
    h24?: number;
  };
  liquidity?: {
    usd?: number;
  };
  fdv?: number;
  priceChange?: {
    h24?: number;
  };
  txns?: {
    h24?: {
      buys?: number;
      sells?: number;
    };
  };
  dexId?: string;
}

interface DexScreenerResponse {
  pairs?: DexScreenerPair[];
}

/**
 * Search DexScreener for a token by symbol
 */
async function searchDexScreener(symbol: string): Promise<DexMarketInfo[]> {
  console.log(`[dexAggregator] DexScreener search for: ${symbol}`);
  
  const url = `${DEXSCREENER_BASE}/search?q=${encodeURIComponent(symbol)}`;
  const data = await safeFetch<DexScreenerResponse>(url);
  
  if (!data?.pairs || !Array.isArray(data.pairs)) {
    console.log(`[dexAggregator] DexScreener: no pairs found for ${symbol}`);
    return [];
  }
  
  // Filter to pairs where base token matches the symbol
  const matchingPairs = data.pairs.filter(p => 
    p.baseToken?.symbol?.toUpperCase() === symbol.toUpperCase()
  );
  
  // Take top 3 pairs by liquidity
  const topPairs = matchingPairs
    .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))
    .slice(0, 3);
  
  console.log(`[dexAggregator] DexScreener: found ${matchingPairs.length} pairs, using top ${topPairs.length}`);
  
  return topPairs.map(p => ({
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    chain: normalizeChain(p.chainId),
    address: p.baseToken.address,
    pairAddress: p.pairAddress,
    dexSource: 'dexscreener' as DexSource,
    dexName: p.dexId,
    priceUsd: p.priceUsd ? parseFloat(p.priceUsd) : undefined,
    liquidityUsd: p.liquidity?.usd,
    volume24hUsd: p.volume?.h24,
    fdvUsd: p.fdv,
    baseToken: p.baseToken.symbol,
    quoteToken: p.quoteToken?.symbol,
    priceChange24h: p.priceChange?.h24,
    txns24h: p.txns?.h24 ? (p.txns.h24.buys || 0) + (p.txns.h24.sells || 0) : undefined,
  }));
}

/**
 * Fetch DexScreener data for a specific token address
 */
async function fetchDexScreenerByAddress(address: string, chain?: string): Promise<DexMarketInfo[]> {
  console.log(`[dexAggregator] DexScreener fetch by address: ${address} (chain: ${chain || 'any'})`);
  
  const url = `${DEXSCREENER_BASE}/tokens/${address}`;
  const data = await safeFetch<DexScreenerResponse>(url);
  
  if (!data?.pairs || !Array.isArray(data.pairs)) {
    console.log(`[dexAggregator] DexScreener: no pairs found for address ${address}`);
    return [];
  }
  
  // Filter by chain if specified
  let pairs = data.pairs;
  if (chain) {
    const normalizedChain = normalizeChain(chain);
    pairs = pairs.filter(p => normalizeChain(p.chainId) === normalizedChain);
  }
  
  // Take top 3 by liquidity
  const topPairs = pairs
    .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))
    .slice(0, 3);
  
  console.log(`[dexAggregator] DexScreener: found ${pairs.length} pairs for address, using top ${topPairs.length}`);
  
  return topPairs.map(p => ({
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    chain: normalizeChain(p.chainId),
    address: p.baseToken.address,
    pairAddress: p.pairAddress,
    dexSource: 'dexscreener' as DexSource,
    dexName: p.dexId,
    priceUsd: p.priceUsd ? parseFloat(p.priceUsd) : undefined,
    liquidityUsd: p.liquidity?.usd,
    volume24hUsd: p.volume?.h24,
    fdvUsd: p.fdv,
    baseToken: p.baseToken.symbol,
    quoteToken: p.quoteToken?.symbol,
    priceChange24h: p.priceChange?.h24,
    txns24h: p.txns?.h24 ? (p.txns.h24.buys || 0) + (p.txns.h24.sells || 0) : undefined,
  }));
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
    quote_token_price_usd?: string;
    reserve_in_usd?: string;
    volume_usd?: {
      h24?: string;
    };
    price_change_percentage?: {
      h24?: string;
    };
    transactions?: {
      h24?: {
        buys?: number;
        sells?: number;
      };
    };
    fdv_usd?: string;
  };
  relationships?: {
    base_token?: {
      data?: {
        id?: string;
      };
    };
    quote_token?: {
      data?: {
        id?: string;
      };
    };
    dex?: {
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
 * Search GeckoTerminal for a token by symbol
 */
async function searchGeckoTerminal(symbol: string): Promise<DexMarketInfo[]> {
  console.log(`[dexAggregator] GeckoTerminal search for: ${symbol}`);
  
  const url = `${GECKOTERMINAL_BASE}/search/pools?query=${encodeURIComponent(symbol)}&page=1`;
  const data = await safeFetch<GeckoTerminalResponse>(url);
  
  if (!data?.data || !Array.isArray(data.data)) {
    console.log(`[dexAggregator] GeckoTerminal: no pools found for ${symbol}`);
    return [];
  }
  
  // Filter to pools where name contains the symbol
  const matchingPools = data.data.filter(p => 
    p.attributes?.name?.toUpperCase().includes(symbol.toUpperCase())
  );
  
  // Take top 3 by liquidity
  const topPools = matchingPools
    .sort((a, b) => {
      const liqA = a.attributes?.reserve_in_usd ? parseFloat(a.attributes.reserve_in_usd) : 0;
      const liqB = b.attributes?.reserve_in_usd ? parseFloat(b.attributes.reserve_in_usd) : 0;
      return liqB - liqA;
    })
    .slice(0, 3);
  
  console.log(`[dexAggregator] GeckoTerminal: found ${matchingPools.length} pools, using top ${topPools.length}`);
  
  return topPools.map(p => {
    // Parse chain from pool ID (format: network_address)
    const poolId = p.id || '';
    const [network] = poolId.split('_');
    
    // Extract base token symbol from name (format: "TOKEN / QUOTE")
    const nameParts = (p.attributes?.name || '').split('/').map(s => s.trim());
    const baseSymbol = nameParts[0] || symbol;
    const quoteSymbol = nameParts[1];
    
    return {
      symbol: baseSymbol,
      name: p.attributes?.name,
      chain: normalizeChain(network),
      address: p.attributes?.address || poolId,
      pairAddress: p.attributes?.address,
      dexSource: 'geckoterminal' as DexSource,
      dexName: p.relationships?.dex?.data?.id,
      priceUsd: p.attributes?.base_token_price_usd ? parseFloat(p.attributes.base_token_price_usd) : undefined,
      liquidityUsd: p.attributes?.reserve_in_usd ? parseFloat(p.attributes.reserve_in_usd) : undefined,
      volume24hUsd: p.attributes?.volume_usd?.h24 ? parseFloat(p.attributes.volume_usd.h24) : undefined,
      fdvUsd: p.attributes?.fdv_usd ? parseFloat(p.attributes.fdv_usd) : undefined,
      baseToken: baseSymbol,
      quoteToken: quoteSymbol,
      priceChange24h: p.attributes?.price_change_percentage?.h24 ? parseFloat(p.attributes.price_change_percentage.h24) : undefined,
      txns24h: p.attributes?.transactions?.h24 ? 
        (p.attributes.transactions.h24.buys || 0) + (p.attributes.transactions.h24.sells || 0) : undefined,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Birdeye Integration (Solana-specific)
// ─────────────────────────────────────────────────────────────────────────────

interface BirdeyeTokenOverview {
  address?: string;
  symbol?: string;
  name?: string;
  price?: number;
  priceChange24hPercent?: number;
  liquidity?: number;
  v24hUSD?: number;
  fdv?: number;
  mc?: number;
}

interface BirdeyeResponse {
  success: boolean;
  data?: BirdeyeTokenOverview;
}

interface BirdeyeSearchResponse {
  success: boolean;
  data?: {
    tokens?: BirdeyeTokenOverview[];
  };
}

/**
 * Fetch Birdeye data for a Solana token by address
 */
async function fetchBirdeyeByAddress(address: string): Promise<DexMarketInfo | null> {
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) {
    console.log('[dexAggregator] Birdeye: BIRDEYE_API_KEY not set, skipping');
    return null;
  }
  
  console.log(`[dexAggregator] Birdeye fetch by address: ${address}`);
  
  const url = `${BIRDEYE_BASE}/token_overview?address=${address}`;
  const data = await safeFetch<BirdeyeResponse>(url, {
    headers: {
      'x-api-key': apiKey,
    },
  });
  
  if (!data?.success || !data.data) {
    console.log(`[dexAggregator] Birdeye: no data for address ${address}`);
    return null;
  }
  
  const token = data.data;
  return {
    symbol: token.symbol || 'UNKNOWN',
    name: token.name,
    chain: 'solana',
    address: token.address || address,
    dexSource: 'birdeye',
    priceUsd: token.price,
    liquidityUsd: token.liquidity,
    volume24hUsd: token.v24hUSD,
    fdvUsd: token.fdv,
    priceChange24h: token.priceChange24hPercent,
  };
}

/**
 * Search Birdeye for a token by symbol
 */
async function searchBirdeye(symbol: string): Promise<DexMarketInfo[]> {
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) {
    console.log('[dexAggregator] Birdeye: BIRDEYE_API_KEY not set, skipping search');
    return [];
  }
  
  console.log(`[dexAggregator] Birdeye search for: ${symbol}`);
  
  // Birdeye doesn't have a direct search by symbol, use DexScreener for Solana instead
  // This is a limitation - we can only use Birdeye if we have the address
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Export Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get DEX market data for a list of tokens.
 * Queries multiple sources and returns aggregated results.
 */
export async function getDexMarketsForSymbols(
  tokens: TokenQuery[]
): Promise<DexMarketInfo[]> {
  console.log(`[dexAggregator] getDexMarketsForSymbols: processing ${tokens.length} tokens`);
  
  const results: DexMarketInfo[] = [];
  const processedSymbols = new Set<string>();
  
  // Process tokens in batches of 5 to avoid overwhelming APIs
  const batchSize = 5;
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (token) => {
      const { symbol, chain, address } = token;
      const tokenKey = `${symbol}-${chain || 'any'}-${address || 'none'}`;
      
      // Skip if already processed
      if (processedSymbols.has(tokenKey)) {
        return [];
      }
      processedSymbols.add(tokenKey);
      
      const tokenResults: DexMarketInfo[] = [];
      
      try {
        // If we have an address, use it directly
        if (address) {
          // DexScreener by address
          const dexScreenerResults = await fetchDexScreenerByAddress(address, chain);
          tokenResults.push(...dexScreenerResults);
          
          // Birdeye for Solana addresses
          if (chain === 'solana' || chain === 'sol') {
            const birdeyeResult = await fetchBirdeyeByAddress(address);
            if (birdeyeResult) {
              tokenResults.push(birdeyeResult);
            }
          }
        } else {
          // Search by symbol
          // DexScreener search
          const dexScreenerResults = await searchDexScreener(symbol);
          tokenResults.push(...dexScreenerResults);
          
          // GeckoTerminal search (as secondary source)
          if (dexScreenerResults.length === 0) {
            const geckoResults = await searchGeckoTerminal(symbol);
            tokenResults.push(...geckoResults);
          }
        }
      } catch (err) {
        console.error(`[dexAggregator] Error processing ${symbol}:`, err);
      }
      
      return tokenResults;
    });
    
    const batchResults = await Promise.all(batchPromises);
    for (const br of batchResults) {
      results.push(...br);
    }
    
    // Small delay between batches to be nice to APIs
    if (i + batchSize < tokens.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log(`[dexAggregator] getDexMarketsForSymbols: returning ${results.length} results`);
  return results;
}

/**
 * Get the best DEX market info for a single symbol across all chains.
 * Returns the result with highest liquidity.
 */
export async function getBestDexMarketForSymbol(symbol: string): Promise<DexMarketInfo | null> {
  const results = await getDexMarketsForSymbols([{ symbol }]);
  
  if (results.length === 0) {
    return null;
  }
  
  // Return the one with highest liquidity
  return results.reduce((best, current) => {
    const bestLiq = best.liquidityUsd || 0;
    const currentLiq = current.liquidityUsd || 0;
    return currentLiq > bestLiq ? current : best;
  });
}

/**
 * Get DEX markets for Solana tokens specifically.
 * Uses Birdeye as primary source if API key is available.
 */
export async function getSolanaDexMarkets(
  tokens: { symbol: string; address?: string }[]
): Promise<DexMarketInfo[]> {
  return getDexMarketsForSymbols(
    tokens.map(t => ({ ...t, chain: 'solana' }))
  );
}

