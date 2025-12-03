/**
 * Price Sync Cron for New Launches
 * 
 * Fetches current prices from DEX/CEX sources and stores as DexSnapshot
 * 
 * Supported sources:
 * - DEXSCREENER: Uses DexScreener API by token address
 * 
 * This endpoint should be called by external cron (cron-job.org, Vercel cron, etc.)
 * Optionally protected with CRON_SECRET header
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../../lib/prisma';

type SyncResponse = {
  ok: boolean;
  updated: number;
  failed: number;
  errors?: string[];
};

// Price source configuration
const PRICE_SOURCES: Record<string, (address: string, chain?: string) => Promise<{
  priceUsd: number;
  volume24h?: number;
  liquidity?: number;
} | null>> = {
  DEXSCREENER: async (address: string, chain?: string) => {
    try {
      // DexScreener API: https://api.dexscreener.com/latest/dex/tokens/{address}
      const chainParam = chain ? `?chain=${chain.toLowerCase()}` : '';
      const url = `https://api.dexscreener.com/latest/dex/tokens/${address}${chainParam}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[DexScreener] HTTP ${response.status} for ${address}`);
        return null;
      }

      const data = await response.json();
      
      // DexScreener returns pairs array, get the first/largest pair
      if (!data.pairs || data.pairs.length === 0) {
        return null;
      }

      // Sort by liquidity and get the top pair
      const pairs = data.pairs.sort((a: any, b: any) => 
        (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      );
      const pair = pairs[0];

      if (!pair.priceUsd) {
        return null;
      }

      return {
        priceUsd: parseFloat(pair.priceUsd),
        volume24h: pair.volume?.h24 ? parseFloat(pair.volume.h24) : undefined,
        liquidity: pair.liquidity?.usd ? parseFloat(pair.liquidity.usd) : undefined,
      };
    } catch (error) {
      console.error(`[DexScreener] Error fetching ${address}:`, error);
      return null;
    }
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SyncResponse>
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      updated: 0,
      failed: 0,
      errors: ['Method not allowed'],
    });
  }

  // Optional: Check CRON_SECRET if provided
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const providedSecret =
      req.headers.authorization?.replace('Bearer ', '') ||
      (req.headers['x-cron-secret'] as string | undefined) ||
      (req.query.secret as string | undefined);

    if (providedSecret !== cronSecret) {
      return res.status(401).json({
        ok: false,
        updated: 0,
        failed: 0,
        errors: ['Unauthorized'],
      });
    }
  }

  try {
    // Find all launches with tokenAddress and priceSource
    const launches = await withDbRetry(() =>
      prisma.newLaunch.findMany({
        where: {
          tokenAddress: { not: null },
          priceSource: { not: null },
        },
        select: {
          id: true,
          tokenAddress: true,
          priceSource: true,
          chain: true,
        },
      })
    );

    if (launches.length === 0) {
      return res.status(200).json({
        ok: true,
        updated: 0,
        failed: 0,
      });
    }

    console.log(`[SyncDexPrices] Found ${launches.length} launches to sync`);

    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process each launch
    for (const launch of launches) {
      if (!launch.tokenAddress || !launch.priceSource) {
        continue;
      }

      const fetchFn = PRICE_SOURCES[launch.priceSource];
      if (!fetchFn) {
        console.warn(`[SyncDexPrices] Unknown price source: ${launch.priceSource}`);
        failed += 1;
        errors.push(`Unknown source: ${launch.priceSource}`);
        continue;
      }

      try {
        const priceData = await fetchFn(launch.tokenAddress, launch.chain || undefined);

        if (!priceData) {
          console.warn(`[SyncDexPrices] No price data for launch ${launch.id}`);
          failed += 1;
          continue;
        }

        // Create DexSnapshot
        await withDbRetry(() =>
          prisma.dexSnapshot.create({
            data: {
              launchId: launch.id,
              priceUsd: priceData.priceUsd,
              volume24h: priceData.volume24h || null,
              liquidity: priceData.liquidity || null,
              source: launch.priceSource!,
              fetchedAt: new Date(),
            },
          })
        );

        updated += 1;
        console.log(
          `[SyncDexPrices] ✅ Updated ${launch.id}: $${priceData.priceUsd.toFixed(4)}`
        );
      } catch (error: any) {
        console.error(`[SyncDexPrices] Error processing launch ${launch.id}:`, error);
        failed += 1;
        errors.push(`Launch ${launch.id}: ${error?.message || 'Unknown error'}`);
      }
    }

    console.log(
      `[SyncDexPrices] Summary: updated=${updated}, failed=${failed}, total=${launches.length}`
    );

    return res.status(200).json({
      ok: true,
      updated,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[SyncDexPrices] Fatal error:', error);
    return res.status(500).json({
      ok: false,
      updated: 0,
      failed: 0,
      errors: [error?.message || 'Internal server error'],
    });
  }
}

