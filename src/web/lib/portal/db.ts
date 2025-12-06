import { prisma } from '../prisma';
import type { MarketSnapshot, MemeTokenSnapshot, DexMarketSnapshot, CexMarketSnapshot } from '@prisma/client';

/**
 * Get recent whale entries from the last 7 days, ordered by occurredAt descending
 */
export async function getRecentWhaleEntries(limit: number = 50) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  return prisma.whaleEntry.findMany({
    where: {
      occurredAt: {
        gte: sevenDaysAgo,
      },
    },
    orderBy: { occurredAt: 'desc' },
    take: limit,
  });
}

/**
 * Get recent liquidity signals, ordered by triggeredAt descending
 */
export async function getRecentLiquiditySignals(limit: number = 10) {
  return prisma.liquiditySignal.findMany({
    orderBy: { triggeredAt: 'desc' },
    take: limit,
  });
}

/**
 * Get whale entries with fallback logic:
 * - First tries to get entries from recent window (default 24h)
 * - If none found, falls back to last N days (default 7 days)
 * - Returns both recent entries and the last known entry (if any)
 */
export async function getWhaleEntriesWithFallback(options?: {
  recentHours?: number;
  fallbackDays?: number;
}) {
  const recentHours = options?.recentHours ?? 24;
  const fallbackDays = options?.fallbackDays ?? 7;

  const now = new Date();
  const recentSince = new Date(now.getTime() - recentHours * 60 * 60 * 1000);

  const recent = await prisma.whaleEntry.findMany({
    where: {
      occurredAt: {
        gte: recentSince,
      },
    },
    orderBy: { occurredAt: 'desc' },
    take: 50,
  });

  if (recent.length > 0) {
    return { recent, lastAny: recent[0] };
  }

  // Fallback: last N days
  const fallbackSince = new Date(now.getTime() - fallbackDays * 24 * 60 * 60 * 1000);

  const fallback = await prisma.whaleEntry.findMany({
    where: {
      occurredAt: {
        gte: fallbackSince,
      },
    },
    orderBy: { occurredAt: 'desc' },
    take: 50,
  });

  return {
    recent: [],
    lastAny: fallback[0] ?? null,
  };
}

/**
 * Get liquidity signals with fallback logic:
 * - First tries to get signals from recent window (default 24h)
 * - If none found, falls back to last N days (default 3 days)
 * - Returns both recent signals and the last known signal (if any)
 */
export async function getLiquiditySignalsWithFallback(options?: {
  recentHours?: number;
  fallbackDays?: number;
  limit?: number;
}) {
  const recentHours = options?.recentHours ?? 24;
  const fallbackDays = options?.fallbackDays ?? 3;
  const limit = options?.limit ?? 10;

  const now = new Date();
  const recentSince = new Date(now.getTime() - recentHours * 60 * 60 * 1000);

  const recent = await prisma.liquiditySignal.findMany({
    where: {
      triggeredAt: {
        gte: recentSince,
      },
    },
    orderBy: { triggeredAt: 'desc' },
    take: limit,
  });

  if (recent.length > 0) {
    return { recent, lastAny: recent[0] };
  }

  const fallbackSince = new Date(now.getTime() - fallbackDays * 24 * 60 * 60 * 1000);

  const fallback = await prisma.liquiditySignal.findMany({
    where: {
      triggeredAt: {
        gte: fallbackSince,
      },
    },
    orderBy: { triggeredAt: 'desc' },
    take: limit,
  });

  return {
    recent: [],
    lastAny: fallback[0] ?? null,
  };
}

export interface LaunchWithMetrics {
  id: string;
  name: string;
  tokenSymbol: string;
  tokenName: string | null;
  chain: string | null;
  category: string | null;
  status: string | null;
  salePriceUsd: number | null;
  tokensForSale: number | null;
  totalRaiseUsd: number | null;
  airdropPercent: number | null;
  airdropValueUsd: number | null;
  vestingInfo: any;
  tokenAddress: string | null;
  priceSource: string | null;
  createdAt: Date;
  updatedAt: Date;
  platform: {
    id: string;
    name: string;
    slug: string;
  } | null;
  primaryPlatform: {
    id: string;
    name: string;
    slug: string;
    kind: string;
  } | null;
  listingPlatform: {
    id: string;
    name: string;
    slug: string;
    kind: string;
  } | null;
  leadInvestor: {
    id: string;
    name: string;
  } | null;
  latestSnapshot: {
    priceUsd: number;
    volume24h: number | null;
    liquidity: number | null;
    source: string;
    fetchedAt: Date;
  } | null;
  roiPercent: number | null;
}

/**
 * Get all launches with platform info, latest price snapshot, and computed ROI
 */
export async function getAllLaunchesWithMetrics(): Promise<LaunchWithMetrics[]> {
  const launches = await prisma.newLaunch.findMany({
    include: {
      platform: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      primaryPlatform: {
        select: {
          id: true,
          name: true,
          slug: true,
          kind: true,
        },
      },
      listingPlatform: {
        select: {
          id: true,
          name: true,
          slug: true,
          kind: true,
        },
      },
      leadInvestor: {
        select: {
          id: true,
          name: true,
        },
      },
      priceSnapshots: {
        orderBy: { fetchedAt: 'desc' },
        take: 1,
        select: {
          priceUsd: true,
          volume24h: true,
          liquidity: true,
          source: true,
          fetchedAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return launches.map((launch) => {
    const latestSnapshot = launch.priceSnapshots[0] || null;
    
    // Calculate ROI: (latestPrice / salePrice - 1) * 100
    let roiPercent: number | null = null;
    if (launch.salePriceUsd && latestSnapshot?.priceUsd) {
      roiPercent = ((latestSnapshot.priceUsd / launch.salePriceUsd) - 1) * 100;
    }

    return {
      id: launch.id,
      name: launch.name,
      tokenSymbol: launch.tokenSymbol,
      tokenName: launch.tokenName,
      chain: launch.chain,
      category: launch.category,
      status: launch.status,
      salePriceUsd: launch.salePriceUsd,
      tokensForSale: launch.tokensForSale,
      totalRaiseUsd: launch.totalRaiseUsd,
      airdropPercent: launch.airdropPercent,
      airdropValueUsd: launch.airdropValueUsd,
      vestingInfo: launch.vestingInfo,
      tokenAddress: launch.tokenAddress,
      priceSource: launch.priceSource,
      createdAt: launch.createdAt,
      updatedAt: launch.updatedAt,
      platform: launch.platform,
      primaryPlatform: launch.primaryPlatform
        ? {
            id: launch.primaryPlatform.id,
            name: launch.primaryPlatform.name,
            slug: launch.primaryPlatform.slug,
            kind: launch.primaryPlatform.kind,
          }
        : null,
      listingPlatform: launch.listingPlatform
        ? {
            id: launch.listingPlatform.id,
            name: launch.listingPlatform.name,
            slug: launch.listingPlatform.slug,
            kind: launch.listingPlatform.kind,
          }
        : null,
      leadInvestor: launch.leadInvestor
        ? {
            id: launch.leadInvestor.id,
            name: launch.leadInvestor.name,
          }
        : null,
      latestSnapshot: latestSnapshot ? {
        priceUsd: latestSnapshot.priceUsd,
        volume24h: latestSnapshot.volume24h,
        liquidity: latestSnapshot.liquidity,
        source: latestSnapshot.source,
        fetchedAt: latestSnapshot.fetchedAt,
      } : null,
      roiPercent,
    };
  });
}

/**
 * Get a single launch by ID with platform info, latest price snapshot, and computed ROI
 */
export async function getLaunchByIdWithMetrics(id: string): Promise<LaunchWithMetrics | null> {
  const launch = await prisma.newLaunch.findUnique({
    where: { id },
    include: {
      platform: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      primaryPlatform: {
        select: {
          id: true,
          name: true,
          slug: true,
          kind: true,
        },
      },
      listingPlatform: {
        select: {
          id: true,
          name: true,
          slug: true,
          kind: true,
        },
      },
      leadInvestor: {
        select: {
          id: true,
          name: true,
        },
      },
      priceSnapshots: {
        orderBy: { fetchedAt: 'desc' },
        take: 1,
        select: {
          priceUsd: true,
          volume24h: true,
          liquidity: true,
          source: true,
          fetchedAt: true,
        },
      },
    },
  });

  if (!launch) {
    return null;
  }

  const latestSnapshot = launch.priceSnapshots[0] || null;
  
  // Calculate ROI: (latestPrice / salePrice - 1) * 100
  let roiPercent: number | null = null;
  if (launch.salePriceUsd && latestSnapshot?.priceUsd) {
    roiPercent = ((latestSnapshot.priceUsd / launch.salePriceUsd) - 1) * 100;
  }

  return {
    id: launch.id,
    name: launch.name,
    tokenSymbol: launch.tokenSymbol,
    tokenName: launch.tokenName,
    chain: launch.chain,
    category: launch.category,
    status: launch.status,
    salePriceUsd: launch.salePriceUsd,
    tokensForSale: launch.tokensForSale,
    totalRaiseUsd: launch.totalRaiseUsd,
    airdropPercent: launch.airdropPercent,
    airdropValueUsd: launch.airdropValueUsd,
    vestingInfo: launch.vestingInfo,
    tokenAddress: launch.tokenAddress,
    priceSource: launch.priceSource,
    createdAt: launch.createdAt,
    updatedAt: launch.updatedAt,
    platform: launch.platform,
    primaryPlatform: launch.primaryPlatform
      ? {
          id: launch.primaryPlatform.id,
          name: launch.primaryPlatform.name,
          slug: launch.primaryPlatform.slug,
          kind: launch.primaryPlatform.kind,
        }
      : null,
    listingPlatform: launch.listingPlatform
      ? {
          id: launch.listingPlatform.id,
          name: launch.listingPlatform.name,
          slug: launch.listingPlatform.slug,
          kind: launch.listingPlatform.kind,
        }
      : null,
    leadInvestor: launch.leadInvestor
      ? {
          id: launch.leadInvestor.id,
          name: launch.leadInvestor.name,
        }
      : null,
    latestSnapshot: latestSnapshot ? {
      priceUsd: latestSnapshot.priceUsd,
      volume24h: latestSnapshot.volume24h,
      liquidity: latestSnapshot.liquidity,
      source: latestSnapshot.source,
      fetchedAt: latestSnapshot.fetchedAt,
    } : null,
    roiPercent,
  };
}

// ============================================
// MARKET & MEME SNAPSHOTS
// ============================================

/**
 * Get the latest batch of MarketSnapshot records.
 * Returns snapshots from the most recent createdAt timestamp (within 5 minutes window).
 */
export async function getLatestMarketSnapshots(limit: number = 50): Promise<MarketSnapshot[]> {
  // First, find the max createdAt timestamp
  const latestRecord = await prisma.marketSnapshot.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  if (!latestRecord) {
    return [];
  }

  // Get all records within 5 minutes of the latest timestamp
  const windowStart = new Date(latestRecord.createdAt.getTime() - 5 * 60 * 1000);

  return prisma.marketSnapshot.findMany({
    where: {
      createdAt: {
        gte: windowStart,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Get the latest batch of MemeTokenSnapshot records.
 * Returns snapshots from the most recent createdAt timestamp (within 5 minutes window).
 */
export async function getLatestMemeTokenSnapshots(limit: number = 50): Promise<MemeTokenSnapshot[]> {
  // First, find the max createdAt timestamp
  const latestRecord = await prisma.memeTokenSnapshot.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  if (!latestRecord) {
    return [];
  }

  // Get all records within 5 minutes of the latest timestamp
  const windowStart = new Date(latestRecord.createdAt.getTime() - 5 * 60 * 1000);

  return prisma.memeTokenSnapshot.findMany({
    where: {
      createdAt: {
        gte: windowStart,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

// ============================================
// DEX & CEX SNAPSHOTS
// ============================================

/**
 * Get DEX market snapshots for a list of symbols.
 * Returns the most recent snapshots for each symbol, grouped by symbol.
 */
export async function getDexSnapshotsForSymbols(symbols: string[]): Promise<DexMarketSnapshot[]> {
  if (symbols.length === 0) {
    return [];
  }

  const normalizedSymbols = symbols.map(s => s.toUpperCase());

  return prisma.dexMarketSnapshot.findMany({
    where: {
      symbol: {
        in: normalizedSymbols,
        mode: 'insensitive',
      },
    },
    orderBy: [
      { liquidityUsd: 'desc' },
      { createdAt: 'desc' },
    ],
  });
}

/**
 * Get CEX market snapshots for a list of symbols.
 * Returns the most recent snapshots for each symbol.
 */
export async function getCexSnapshotsForSymbols(symbols: string[]): Promise<CexMarketSnapshot[]> {
  if (symbols.length === 0) {
    return [];
  }

  const normalizedSymbols = symbols.map(s => s.toUpperCase());

  return prisma.cexMarketSnapshot.findMany({
    where: {
      symbol: {
        in: normalizedSymbols,
        mode: 'insensitive',
      },
    },
    orderBy: [
      { volume24hUsd: 'desc' },
      { createdAt: 'desc' },
    ],
  });
}

/**
 * Get top tokens by DEX liquidity.
 * Returns the tokens with highest liquidity across all DEX sources.
 */
export async function getTopDexByLiquidity(limit: number = 10): Promise<DexMarketSnapshot[]> {
  return prisma.dexMarketSnapshot.findMany({
    where: {
      liquidityUsd: {
        not: null,
        gt: 0,
      },
    },
    orderBy: { liquidityUsd: 'desc' },
    take: limit,
  });
}

/**
 * Get top tokens by 24h DEX volume.
 */
export async function getTopDexByVolume(limit: number = 10): Promise<DexMarketSnapshot[]> {
  return prisma.dexMarketSnapshot.findMany({
    where: {
      volume24hUsd: {
        not: null,
        gt: 0,
      },
    },
    orderBy: { volume24hUsd: 'desc' },
    take: limit,
  });
}

/**
 * Get aggregated DEX data for a single symbol.
 * Returns the best liquidity and total volume across all DEX sources.
 */
export async function getDexAggregateForSymbol(symbol: string): Promise<{
  maxLiquidityUsd: number | null;
  totalVolume24hUsd: number | null;
  sources: string[];
  chains: string[];
} | null> {
  const snapshots = await prisma.dexMarketSnapshot.findMany({
    where: {
      symbol: {
        equals: symbol,
        mode: 'insensitive',
      },
    },
  });

  if (snapshots.length === 0) {
    return null;
  }

  const maxLiquidity = Math.max(
    ...snapshots.map(s => s.liquidityUsd || 0)
  );
  
  const totalVolume = snapshots.reduce(
    (sum, s) => sum + (s.volume24hUsd || 0),
    0
  );

  // Use 'dex' field instead of 'dexSource' per schema
  const sources = [...new Set(snapshots.map(s => s.dex).filter(Boolean))] as string[];
  const chains = [...new Set(snapshots.map(s => s.chain).filter(Boolean))] as string[];

  return {
    maxLiquidityUsd: maxLiquidity > 0 ? maxLiquidity : null,
    totalVolume24hUsd: totalVolume > 0 ? totalVolume : null,
    sources,
    chains,
  };
}

/**
 * Get CEX sources where a symbol is trading.
 * Note: The new schema uses 'source' field, not 'exchange'.
 */
export async function getCexSourcesForSymbol(symbol: string): Promise<string[]> {
  const snapshots = await prisma.cexMarketSnapshot.findMany({
    where: {
      symbol: {
        equals: symbol,
        mode: 'insensitive',
      },
    },
    select: {
      source: true,
    },
    distinct: ['source'],
  });

  return snapshots.map(s => s.source);
}

/**
 * Get a summary of where a token trades (DEX + CEX).
 */
export async function getTradingVenuesSummary(symbol: string): Promise<{
  dexSources: string[];
  dexChains: string[];
  cexSources: string[];
  hasDex: boolean;
  hasCex: boolean;
}> {
  const [dexSnapshots, cexSnapshots] = await Promise.all([
    prisma.dexMarketSnapshot.findMany({
      where: {
        symbol: {
          equals: symbol,
          mode: 'insensitive',
        },
      },
      select: {
        dex: true,
        chain: true,
      },
    }),
    prisma.cexMarketSnapshot.findMany({
      where: {
        symbol: {
          equals: symbol,
          mode: 'insensitive',
        },
      },
      select: {
        source: true,
      },
    }),
  ]);

  return {
    dexSources: [...new Set(dexSnapshots.map(s => s.dex).filter(Boolean))] as string[],
    dexChains: [...new Set(dexSnapshots.map(s => s.chain).filter(Boolean))] as string[],
    cexSources: [...new Set(cexSnapshots.map(s => s.source))],
    hasDex: dexSnapshots.length > 0,
    hasCex: cexSnapshots.length > 0,
  };
}

/**
 * Get latest DEX snapshots ordered by createdAt.
 */
export async function getLatestDexSnapshots(limit: number = 30): Promise<DexMarketSnapshot[]> {
  return prisma.dexMarketSnapshot.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Get latest CEX snapshots ordered by createdAt.
 */
export async function getLatestCexSnapshots(limit: number = 30): Promise<CexMarketSnapshot[]> {
  return prisma.cexMarketSnapshot.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

// ============================================
// DEDUPLICATED DEX/CEX SNAPSHOTS (Best Pair Logic)
// ============================================

/**
 * Simplified DEX liquidity row for UI
 */
export interface DexLiquidityRow {
  symbol: string | null;
  name: string | null;
  chain: string | null;
  dex: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  txns24h: number | null;
}

/**
 * Get deduplicated DEX liquidity snapshots.
 * Picks best pair per (tokenAddress, chain) by highest liquidity, then volume.
 */
export async function getDexLiquiditySnapshots(limit: number = 20): Promise<DexLiquidityRow[]> {
  const snapshots = await prisma.dexMarketSnapshot.findMany({
    where: {
      liquidityUsd: { gt: 0 },
    },
    orderBy: [
      { liquidityUsd: 'desc' },
      { volume24hUsd: 'desc' },
    ],
  });

  if (snapshots.length === 0) {
    return [];
  }

  // Deduplicate by tokenAddress+chain (or symbol+chain if no tokenAddress)
  const bestByKey = new Map<string, DexMarketSnapshot>();

  for (const snap of snapshots) {
    const key = snap.tokenAddress 
      ? `${snap.tokenAddress}-${snap.chain || 'unknown'}`
      : `${(snap.symbol || 'unknown').toUpperCase()}-${snap.chain || 'unknown'}`;

    const existing = bestByKey.get(key);
    if (!existing) {
      bestByKey.set(key, snap);
      continue;
    }

    // Compare: prefer higher liquidity, then higher volume
    const existingLiq = existing.liquidityUsd || 0;
    const snapLiq = snap.liquidityUsd || 0;
    const existingVol = existing.volume24hUsd || 0;
    const snapVol = snap.volume24hUsd || 0;

    if (snapLiq > existingLiq || (snapLiq === existingLiq && snapVol > existingVol)) {
      bestByKey.set(key, snap);
    }
  }

  // Convert to simplified rows and sort
  const rows: DexLiquidityRow[] = Array.from(bestByKey.values())
    .sort((a, b) => {
      const liqA = a.liquidityUsd || 0;
      const liqB = b.liquidityUsd || 0;
      if (liqB !== liqA) return liqB - liqA;
      return (b.volume24hUsd || 0) - (a.volume24hUsd || 0);
    })
    .slice(0, limit)
    .map(snap => ({
      symbol: snap.symbol,
      name: snap.name,
      chain: snap.chain,
      dex: snap.dex,
      priceUsd: snap.priceUsd,
      liquidityUsd: snap.liquidityUsd,
      volume24hUsd: snap.volume24hUsd,
      txns24h: snap.txns24h,
    }));

  return rows;
}

/**
 * Simplified CEX market row for UI
 */
export interface CexMarketRow {
  symbol: string;
  pair: string | null;
  exchange: string;
  priceUsd: number | null;
  volume24hUsd: number | null;
}

/**
 * Get deduplicated CEX market snapshots.
 * Picks best entry per symbol by highest volume.
 */
export async function getCexMarketSnapshots(limit: number = 20): Promise<CexMarketRow[]> {
  const snapshots = await prisma.cexMarketSnapshot.findMany({
    where: {
      volume24hUsd: { gt: 0 },
    },
    orderBy: [
      { volume24hUsd: 'desc' },
    ],
  });

  if (snapshots.length === 0) {
    return [];
  }

  // Deduplicate by symbol (keep highest volume)
  const bestBySymbol = new Map<string, CexMarketSnapshot>();

  for (const snap of snapshots) {
    const key = snap.symbol.toUpperCase();
    const existing = bestBySymbol.get(key);

    if (!existing) {
      bestBySymbol.set(key, snap);
      continue;
    }

    // Compare: prefer higher volume
    if ((snap.volume24hUsd || 0) > (existing.volume24hUsd || 0)) {
      bestBySymbol.set(key, snap);
    }
  }

  // Convert to simplified rows
  const rows: CexMarketRow[] = Array.from(bestBySymbol.values())
    .sort((a, b) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0))
    .slice(0, limit)
    .map(snap => ({
      symbol: snap.symbol,
      pair: snap.baseAsset && snap.quoteAsset 
        ? `${snap.baseAsset}/${snap.quoteAsset}` 
        : null,
      exchange: snap.source.toUpperCase().replace('CEX_AGGREGATOR_V1', 'CEX'),
      priceUsd: snap.priceUsd,
      volume24hUsd: snap.volume24hUsd,
    }));

  return rows;
}

/**
 * Get Solana DEX tokens by volume (for meme fallback)
 */
export async function getSolanaDexTokensByVolume(limit: number = 20): Promise<DexLiquidityRow[]> {
  const snapshots = await prisma.dexMarketSnapshot.findMany({
    where: {
      chain: {
        contains: 'sol',
        mode: 'insensitive',
      },
      volume24hUsd: { gt: 0 },
    },
    orderBy: { volume24hUsd: 'desc' },
  });

  if (snapshots.length === 0) {
    return [];
  }

  // Deduplicate by symbol
  const bestBySymbol = new Map<string, DexMarketSnapshot>();

  for (const snap of snapshots) {
    const key = (snap.symbol || 'unknown').toUpperCase();
    const existing = bestBySymbol.get(key);

    if (!existing || (snap.volume24hUsd || 0) > (existing.volume24hUsd || 0)) {
      bestBySymbol.set(key, snap);
    }
  }

  return Array.from(bestBySymbol.values())
    .sort((a, b) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0))
    .slice(0, limit)
    .map(snap => ({
      symbol: snap.symbol,
      name: snap.name,
      chain: snap.chain,
      dex: snap.dex,
      priceUsd: snap.priceUsd,
      liquidityUsd: snap.liquidityUsd,
      volume24hUsd: snap.volume24hUsd,
      txns24h: snap.txns24h,
    }));
}

/**
 * Get meme token snapshots from the last 24 hours
 */
export async function getMemeSnapshots(limit: number = 30): Promise<MemeTokenSnapshot[]> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return prisma.memeTokenSnapshot.findMany({
    where: {
      createdAt: { gte: oneDayAgo },
    },
    orderBy: [
      { marketCapUsd: 'desc' },
      { priceUsd: 'desc' },
    ],
    take: limit,
  });
}

// ============================================
// PORTAL MARKET OVERVIEW & RADAR HELPERS
// ============================================

// Symbols to exclude from meme listings (majors) - comprehensive list
export const MEME_EXCLUDED_SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'BNB', 'XRP', 'LINK', 'WETH', 'WBTC',
  'DOGE', 'ADA', 'DOT', 'MATIC', 'AVAX', 'TRX', 'SHIB', 'LTC', 'ATOM', 'UNI',
  'TON', 'DAI', 'STETH', 'WBNB', 'LEO', 'OKB', 'NEAR', 'ICP', 'APT', 'FIL',
  'ARB', 'OP', 'IMX', 'INJ', 'STX', 'MKR', 'AAVE', 'GRT', 'FTM', 'ALGO',
  'HBAR', 'EOS', 'SAND', 'MANA', 'XLM', 'VET', 'THETA', 'EGLD', 'AXS',
  'WRAPPED', 'STAKED', 'BRIDGED',
];

// Major names to exclude (case-insensitive contains check)
export const MEME_EXCLUDED_NAMES = [
  'bitcoin', 'ethereum', 'solana', 'binance', 'tether', 'usd coin', 'wrapped',
  'staked', 'bridged', 'liquid', 'lido', 'compound', 'aave', 'uniswap',
  'chainlink', 'polygon', 'avalanche', 'cardano', 'polkadot', 'cosmos',
];

// Meme keywords for filtering
export const MEME_KEYWORDS = [
  'pepe', 'doge', 'shib', 'floki', 'bonk', 'wif', 'mog', 'popcat', 'cat', 'dog',
  'frog', 'wojak', 'chad', 'npc', 'wen', 'moon', 'pump', 'inu', 'elon', 'meme',
  'baby', 'safe', 'rocket', 'goat', 'act', 'turbo', 'brett', 'andy', 'toshi', 
  'neiro', 'pnut', 'chill', 'hamster', 'pengu', 'trump', 'biden', 'milady',
  'boden', 'tremp', 'jeo', 'based', 'retard', 'autist', 'degen', 'ape',
];

/**
 * Check if a token is a major (should be excluded from meme lists)
 */
export function isMajorToken(symbol: string | null, name: string | null): boolean {
  const symbolUpper = (symbol || '').toUpperCase();
  const nameLower = (name || '').toLowerCase();
  
  // Check symbol against excluded list
  if (MEME_EXCLUDED_SYMBOLS.includes(symbolUpper)) {
    return true;
  }
  
  // Check name against excluded patterns
  if (MEME_EXCLUDED_NAMES.some(pattern => nameLower.includes(pattern))) {
    return true;
  }
  
  return false;
}

/**
 * Check if a symbol/name is meme-ish based on keywords
 */
export function isMemeToken(symbol: string | null, name: string | null): boolean {
  const symbolLower = (symbol || '').toLowerCase();
  const nameLower = (name || '').toLowerCase();
  
  // Must NOT be a major
  if (isMajorToken(symbol, name)) {
    return false;
  }
  
  // Check for meme keywords
  return MEME_KEYWORDS.some(keyword => 
    symbolLower.includes(keyword) || nameLower.includes(keyword)
  );
}

/**
 * Portal Market Overview
 * Returns aggregated tracked market cap and 24h volume from CEX + DEX snapshots
 */
export interface PortalMarketOverview {
  trackedMarketCapUsd: number;
  trackedVolume24hUsd: number;
  lastUpdated: Date | null;
}

export async function getPortalMarketOverview(): Promise<PortalMarketOverview> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [dexSnapshots, cexSnapshots, marketSnapshots] = await Promise.all([
    prisma.dexMarketSnapshot.findMany({
      where: { createdAt: { gte: oneDayAgo } },
      select: { liquidityUsd: true, volume24hUsd: true, createdAt: true },
    }),
    prisma.cexMarketSnapshot.findMany({
      where: { createdAt: { gte: oneDayAgo } },
      select: { volume24hUsd: true, createdAt: true },
    }),
    prisma.marketSnapshot.findMany({
      where: { createdAt: { gte: oneDayAgo } },
      select: { marketCapUsd: true, volume24hUsd: true, createdAt: true },
    }),
  ]);

  // Sum market cap from MarketSnapshot (most accurate)
  let trackedMarketCapUsd = marketSnapshots.reduce(
    (sum, s) => sum + (s.marketCapUsd || 0), 0
  );
  
  // Add DEX liquidity as proxy for smaller tokens
  trackedMarketCapUsd += dexSnapshots.reduce(
    (sum, s) => sum + (s.liquidityUsd || 0), 0
  );

  // Sum volumes from DEX + CEX
  const dexVolume = dexSnapshots.reduce((sum, s) => sum + (s.volume24hUsd || 0), 0);
  const cexVolume = cexSnapshots.reduce((sum, s) => sum + (s.volume24hUsd || 0), 0);
  const marketVolume = marketSnapshots.reduce((sum, s) => sum + (s.volume24hUsd || 0), 0);

  const trackedVolume24hUsd = dexVolume + cexVolume + marketVolume;

  // Find most recent timestamp
  const allDates = [
    ...dexSnapshots.map(s => s.createdAt),
    ...cexSnapshots.map(s => s.createdAt),
    ...marketSnapshots.map(s => s.createdAt),
  ].filter(Boolean);

  const lastUpdated = allDates.length > 0
    ? new Date(Math.max(...allDates.map(d => d.getTime())))
    : null;

  return {
    trackedMarketCapUsd,
    trackedVolume24hUsd,
    lastUpdated,
  };
}

/**
 * DEX Liquidity Radar
 * Returns top DEX pairs by liquidity
 */
export async function getDexLiquidityRadar(limit: number = 8): Promise<DexLiquidityRow[]> {
  return getDexLiquiditySnapshots(limit);
}

/**
 * CEX Market Heatmap
 * Returns top CEX markets by volume
 */
export async function getCexMarketHeatmap(limit: number = 8): Promise<CexMarketRow[]> {
  return getCexMarketSnapshots(limit);
}

/**
 * Chain Flow Row for UI
 */
export interface ChainFlowRow {
  chain: string;
  netFlow24hUsd: number;
  dominantStablecoin: string | null;
  signalLabel: string | null;
  lastUpdated: Date;
}

/**
 * Chain Flow Radar
 * Aggregates stablecoin flows per chain and attaches any matching signals
 */
export async function getChainFlowRadar(limit: number = 8): Promise<ChainFlowRow[]> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [flows, signals] = await Promise.all([
    prisma.stablecoinFlowSnapshot.findMany({
      where: { windowEnd: { gte: oneDayAgo } },
      orderBy: { windowEnd: 'desc' },
    }),
    prisma.liquiditySignal.findMany({
      where: { triggeredAt: { gte: oneDayAgo } },
      orderBy: { triggeredAt: 'desc' },
    }),
  ]);

  // Aggregate flows by destination chain
  const chainFlows = new Map<string, {
    netFlow: number;
    stablecoins: Map<string, number>;
    lastUpdated: Date;
  }>();

  for (const flow of flows) {
    const chain = flow.toChain;
    const existing = chainFlows.get(chain) || {
      netFlow: 0,
      stablecoins: new Map<string, number>(),
      lastUpdated: flow.windowEnd,
    };

    existing.netFlow += flow.netAmountUsd;
    existing.stablecoins.set(
      flow.stableSymbol,
      (existing.stablecoins.get(flow.stableSymbol) || 0) + Math.abs(flow.netAmountUsd)
    );
    
    if (flow.windowEnd > existing.lastUpdated) {
      existing.lastUpdated = flow.windowEnd;
    }

    chainFlows.set(chain, existing);
  }

  // Create signal lookup by chain
  const signalByChain = new Map<string, string>();
  for (const signal of signals) {
    if (signal.chain && !signalByChain.has(signal.chain)) {
      signalByChain.set(signal.chain, signal.title);
    }
  }

  // Convert to rows
  const rows: ChainFlowRow[] = Array.from(chainFlows.entries())
    .map(([chain, data]) => {
      // Find dominant stablecoin
      let dominantStablecoin: string | null = null;
      let maxVolume = 0;
      for (const [stable, volume] of data.stablecoins.entries()) {
        if (volume > maxVolume) {
          maxVolume = volume;
          dominantStablecoin = stable;
        }
      }

      return {
        chain,
        netFlow24hUsd: data.netFlow,
        dominantStablecoin,
        signalLabel: signalByChain.get(chain) || null,
        lastUpdated: data.lastUpdated,
      };
    })
    .sort((a, b) => Math.abs(b.netFlow24hUsd) - Math.abs(a.netFlow24hUsd))
    .slice(0, limit);

  return rows;
}

/**
 * Whale Radar Row for UI
 */
export interface WhaleRadarRow {
  id: string;
  occurredAt: Date;
  chain: string;
  tokenSymbol: string;
  side: 'Accumulating' | 'Distributing';
  sizeUsd: number;
  source: string;
}

/**
 * Whale Radar
 * Returns recent whale entries within lookback window
 */
export async function getWhaleRadar(limit: number = 10, lookbackHours: number = 24): Promise<WhaleRadarRow[]> {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

  const entries = await prisma.whaleEntry.findMany({
    where: {
      occurredAt: { gte: since },
    },
    orderBy: { occurredAt: 'desc' },
    take: limit,
  });

  return entries.map(entry => ({
    id: entry.id,
    occurredAt: entry.occurredAt,
    chain: entry.chain,
    tokenSymbol: entry.tokenSymbol,
    // Positive amount = accumulating, negative = distributing
    side: entry.amountUsd >= 0 ? 'Accumulating' : 'Distributing',
    sizeUsd: Math.abs(entry.amountUsd),
    source: 'Uniblock',
  }));
}

/**
 * Trending Market Row for UI
 */
export interface TrendingMarketRow {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24hPct: number;
  volume24hUsd: number | null;
  lastUpdated: Date;
}

/**
 * Trending Markets
 * Returns top movers by absolute 24h change
 */
export async function getTrendingMarkets(limit: number = 6): Promise<TrendingMarketRow[]> {
  // Get latest snapshots
  const snapshots = await getLatestMarketSnapshots(100);

  if (snapshots.length === 0) {
    return [];
  }

  // Sort by absolute change and take top N
  return snapshots
    .filter(s => s.change24hPct !== null)
    .sort((a, b) => Math.abs(b.change24hPct || 0) - Math.abs(a.change24hPct || 0))
    .slice(0, limit)
    .map(s => ({
      id: s.id,
      symbol: s.symbol,
      name: s.name,
      priceUsd: s.priceUsd,
      change24hPct: s.change24hPct || 0,
      volume24hUsd: s.volume24hUsd,
      lastUpdated: s.createdAt,
    }));
}

/**
 * Meme Radar Row for UI
 */
export interface MemeRadarRow {
  symbol: string;
  name: string;
  chain: string | null;
  priceUsd: number | null;
  volume24hUsd: number | null;
  change24hPct: number | null;
  source: string;
  lastUpdated: Date;
}

/**
 * Meme Radar Snapshot
 * Prefers MemeTokenSnapshot, falls back to DEX with strict meme keyword filter
 * STRICTLY excludes majors like ETH, SOL, BTC etc.
 */
export async function getMemeRadarSnapshot(limit: number = 15): Promise<{
  memes: MemeRadarRow[];
  source: 'meme_snapshots' | 'dex_fallback' | 'none';
  lastUpdated: Date | null;
}> {
  // Try MemeTokenSnapshot first
  const memeSnapshots = await getMemeSnapshots(50);

  if (memeSnapshots.length > 0) {
    // Strictly filter out majors using both symbol AND name check
    const filtered = memeSnapshots
      .filter(s => !isMajorToken(s.symbol, s.name))
      .slice(0, limit);

    // If we have at least 5 memes after filtering, use them
    if (filtered.length >= 5) {
      const lastUpdated = filtered.reduce((max, s) => s.createdAt > max ? s.createdAt : max, filtered[0].createdAt);

      return {
        memes: filtered.map(s => ({
          symbol: s.symbol,
          name: s.name,
          chain: null,
          priceUsd: s.priceUsd,
          volume24hUsd: null,
          change24hPct: s.change24hPct,
          source: s.source || 'coingecko',
          lastUpdated: s.createdAt,
        })),
        source: 'meme_snapshots',
        lastUpdated,
      };
    }
  }

  // Fallback to DEX snapshots with STRICT meme filter
  const dexSnapshots = await prisma.dexMarketSnapshot.findMany({
    where: {
      volume24hUsd: { gt: 0 },
    },
    orderBy: { volume24hUsd: 'desc' },
    take: 200, // Get more to filter from
  });

  if (dexSnapshots.length === 0) {
    return { memes: [], source: 'none', lastUpdated: null };
  }

  // STRICTLY filter: must NOT be a major AND must pass meme keyword check
  const memeDex = dexSnapshots
    .filter(s => {
      // Must not be a major
      if (isMajorToken(s.symbol, s.name)) return false;
      // Must have meme keywords
      return isMemeToken(s.symbol, s.name);
    })
    .slice(0, limit);

  // If no meme tokens found, return empty - DO NOT fall back to non-meme tokens
  if (memeDex.length === 0) {
    return { memes: [], source: 'none', lastUpdated: null };
  }

  const lastUpdated = memeDex.reduce((max, s) => s.createdAt > max ? s.createdAt : max, memeDex[0].createdAt);

  return {
    memes: memeDex.map(s => ({
      symbol: s.symbol || 'UNKNOWN',
      name: s.name || s.symbol || 'Unknown',
      chain: s.chain,
      priceUsd: s.priceUsd,
      volume24hUsd: s.volume24hUsd,
      change24hPct: null,
      source: s.dex || s.source || 'dexscreener',
      lastUpdated: s.createdAt,
    })),
    source: 'dex_fallback',
    lastUpdated,
  };
}

/**
 * Chain Volume Row for UI (aggregated from DEX data)
 */
export interface ChainVolumeRow {
  chain: string;
  totalVolume24hUsd: number;
  totalLiquidityUsd: number;
  pairCount: number;
  lastUpdated: Date;
}

/**
 * Get aggregated DEX volume by chain
 * Used as fallback when stablecoin flow data is empty
 */
export async function getChainVolumeAggregation(limit: number = 6): Promise<ChainVolumeRow[]> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const dexSnapshots = await prisma.dexMarketSnapshot.findMany({
    where: { createdAt: { gte: oneDayAgo } },
    select: { 
      chain: true, 
      volume24hUsd: true, 
      liquidityUsd: true, 
      createdAt: true 
    },
  });

  if (dexSnapshots.length === 0) {
    return [];
  }

  // Aggregate by chain
  const chainData = new Map<string, {
    volume: number;
    liquidity: number;
    count: number;
    lastUpdated: Date;
  }>();

  for (const snap of dexSnapshots) {
    const chain = snap.chain || 'Unknown';
    const existing = chainData.get(chain) || {
      volume: 0,
      liquidity: 0,
      count: 0,
      lastUpdated: snap.createdAt,
    };

    existing.volume += snap.volume24hUsd || 0;
    existing.liquidity += snap.liquidityUsd || 0;
    existing.count += 1;
    if (snap.createdAt > existing.lastUpdated) {
      existing.lastUpdated = snap.createdAt;
    }

    chainData.set(chain, existing);
  }

  return Array.from(chainData.entries())
    .map(([chain, data]) => ({
      chain,
      totalVolume24hUsd: data.volume,
      totalLiquidityUsd: data.liquidity,
      pairCount: data.count,
      lastUpdated: data.lastUpdated,
    }))
    .sort((a, b) => b.totalVolume24hUsd - a.totalVolume24hUsd)
    .slice(0, limit);
}

/**
 * Enhanced Chain Flow Radar with DEX volume fallback
 */
export async function getEnhancedChainFlowRadar(limit: number = 6): Promise<{
  flows: ChainFlowRow[];
  source: 'stablecoin_flows' | 'dex_volume' | 'none';
  lastUpdated: Date | null;
}> {
  // First try stablecoin flow data
  const chainFlows = await getChainFlowRadar(limit);
  
  if (chainFlows.length > 0) {
    const lastUpdated = chainFlows.reduce(
      (max, f) => f.lastUpdated > max ? f.lastUpdated : max, 
      chainFlows[0].lastUpdated
    );
    return {
      flows: chainFlows,
      source: 'stablecoin_flows',
      lastUpdated,
    };
  }

  // Fallback to DEX volume aggregation
  const chainVolumes = await getChainVolumeAggregation(limit);
  
  if (chainVolumes.length === 0) {
    return { flows: [], source: 'none', lastUpdated: null };
  }

  // Convert to ChainFlowRow format (using volume as proxy for "flow")
  const lastUpdated = chainVolumes.reduce(
    (max, v) => v.lastUpdated > max ? v.lastUpdated : max, 
    chainVolumes[0].lastUpdated
  );

  return {
    flows: chainVolumes.map(v => ({
      chain: v.chain,
      netFlow24hUsd: v.totalVolume24hUsd, // Use volume as proxy
      dominantStablecoin: null,
      signalLabel: `${v.pairCount} pairs tracked`,
      lastUpdated: v.lastUpdated,
    })),
    source: 'dex_volume',
    lastUpdated,
  };
}

/**
 * Get top liquidity rotation signals (simplified)
 */
export interface LiquidityRotationSignal {
  chain: string;
  direction: 'inflow' | 'outflow' | 'neutral';
  changePercent: number | null;
  description: string;
  lastUpdated: Date;
}

export async function getLiquidityRotationSignals(limit: number = 4): Promise<{
  signals: LiquidityRotationSignal[];
  source: 'computed' | 'none';
  lastUpdated: Date | null;
}> {
  const chainVolumes = await getChainVolumeAggregation(10);
  
  if (chainVolumes.length < 2) {
    return { signals: [], source: 'none', lastUpdated: null };
  }

  // Calculate total and per-chain share
  const totalVolume = chainVolumes.reduce((sum, c) => sum + c.totalVolume24hUsd, 0);
  
  if (totalVolume === 0) {
    return { signals: [], source: 'none', lastUpdated: null };
  }

  const signals: LiquidityRotationSignal[] = chainVolumes
    .slice(0, limit)
    .map(chain => {
      const share = (chain.totalVolume24hUsd / totalVolume) * 100;
      let direction: 'inflow' | 'outflow' | 'neutral' = 'neutral';
      let description = `${share.toFixed(1)}% of tracked DEX volume`;
      
      // Top chain gets "inflow" label
      if (chain === chainVolumes[0]) {
        direction = 'inflow';
        description = `Leading with ${share.toFixed(1)}% of volume`;
      }

      return {
        chain: chain.chain,
        direction,
        changePercent: null, // Would need historical data
        description,
        lastUpdated: chain.lastUpdated,
      };
    });

  const lastUpdated = signals.length > 0 ? signals[0].lastUpdated : null;

  return { signals, source: 'computed', lastUpdated };
}

