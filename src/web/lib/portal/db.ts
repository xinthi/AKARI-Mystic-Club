import { prisma } from '../prisma';

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

