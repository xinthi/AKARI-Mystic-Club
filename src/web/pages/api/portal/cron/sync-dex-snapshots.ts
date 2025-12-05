/**
 * DEX Snapshots Sync Cron
 * 
 * Fetches aggregated DEX market data from DexScreener, GeckoTerminal, and Birdeye
 * and stores as DexMarketSnapshot records.
 * 
 * Protected with CRON_SECRET (query param, Authorization header, or x-cron-secret header).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { prisma, withDbRetry } from '../../../../lib/prisma';
import { fetchDexSnapshots, type DexSnapshotInput } from '../../../../services/dexEnrichment';

type SyncResponse = {
  ok: boolean;
  snapshots: number;
  error?: string;
  debug?: {
    fetchedCount?: number;
    sources?: Record<string, number>;
  };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SyncResponse>
) {
  // Only allow GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      snapshots: 0,
      error: 'Method not allowed',
    });
  }

  // Validate CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const providedSecret =
      req.headers.authorization?.replace('Bearer ', '') ||
      (req.headers['x-cron-secret'] as string | undefined) ||
      (req.query.secret as string | undefined);

    if (providedSecret !== cronSecret) {
      console.log('[sync-dex-snapshots] Unauthorized request');
      return res.status(401).json({
        ok: false,
        snapshots: 0,
        error: 'Unauthorized',
      });
    }
  }

  try {
    console.log('[sync-dex-snapshots] Starting sync...');

    // Fetch DEX data from aggregator
    const dexData = await fetchDexSnapshots(50);
    console.log(`[sync-dex-snapshots] Fetched ${dexData.length} DEX snapshots`);

    if (dexData.length === 0) {
      console.log('[sync-dex-snapshots] No DEX data returned from aggregator');
      return res.status(200).json({
        ok: true,
        snapshots: 0,
        debug: {
          fetchedCount: 0,
          sources: {},
        },
        error: 'No data from DEX APIs. This is normal if APIs are temporarily unavailable.',
      });
    }

    // Count by source (dex field)
    const sourceCounts: Record<string, number> = {};
    for (const item of dexData) {
      const dex = item.dex || 'unknown';
      sourceCounts[dex] = (sourceCounts[dex] || 0) + 1;
    }

    // Delete old snapshots (older than 24h)
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const deleteResult = await prisma.dexMarketSnapshot.deleteMany({
        where: {
          createdAt: {
            lt: oneDayAgo,
          },
        },
      });
      if (deleteResult.count > 0) {
        console.log(`[sync-dex-snapshots] Deleted ${deleteResult.count} old snapshots`);
      }
    } catch (cleanupError) {
      console.error('[sync-dex-snapshots] Cleanup error (non-fatal):', cleanupError);
    }

    // Build snapshot data with explicit IDs
    const data = dexData.map((item: DexSnapshotInput) => ({
      id: randomUUID(),
      symbol: item.symbol,
      name: item.name,
      source: item.source,
      chain: item.chain,
      dex: item.dex,
      pairAddress: item.pairAddress,
      tokenAddress: item.tokenAddress,
      priceUsd: item.priceUsd,
      liquidityUsd: item.liquidityUsd,
      volume24hUsd: item.volume24hUsd,
      txns24h: item.txns24h,
    }));

    console.log(`[sync-dex-snapshots] Inserting ${data.length} snapshots...`);

    // Insert snapshots
    const result = await withDbRetry(() =>
      prisma.dexMarketSnapshot.createMany({
        data,
      })
    );

    console.log(`[sync-dex-snapshots] Inserted ${result.count} snapshots`);

    return res.status(200).json({
      ok: true,
      snapshots: result.count,
      debug: {
        fetchedCount: dexData.length,
        sources: sourceCounts,
      },
    });
  } catch (error: any) {
    console.error('[sync-dex-snapshots] Error:', error?.message || error);
    return res.status(500).json({
      ok: false,
      snapshots: 0,
      error: `Error: ${error?.message || 'Unknown error'}`,
    });
  }
}

