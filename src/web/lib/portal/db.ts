import { prisma } from '../prisma';

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

