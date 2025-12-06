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

