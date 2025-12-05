/**
 * CEX Snapshots Sync Cron
 * 
 * Fetches aggregated CEX market data from Binance, OKX, and KuCoin
 * and stores as CexMarketSnapshot records.
 * 
 * Protected with CRON_SECRET (query param, Authorization header, or x-cron-secret header).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { prisma, withDbRetry } from '../../../../lib/prisma';
import { fetchCexSnapshots, type CexSnapshotInput } from '../../../../services/cexEnrichment';

type SyncResponse = {
  ok: boolean;
  snapshots: number;
  error?: string;
  debug?: {
    fetchedCount?: number;
    exchanges?: Record<string, number>;
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
      console.log('[sync-cex-snapshots] Unauthorized request');
      return res.status(401).json({
        ok: false,
        snapshots: 0,
        error: 'Unauthorized',
      });
    }
  }

  try {
    console.log('[sync-cex-snapshots] Starting sync...');

    // Fetch CEX data from aggregator
    const cexData = await fetchCexSnapshots(50);
    console.log(`[sync-cex-snapshots] Fetched ${cexData.length} CEX snapshots`);

    if (cexData.length === 0) {
      console.log('[sync-cex-snapshots] No CEX data returned from aggregator');
      return res.status(200).json({
        ok: true,
        snapshots: 0,
        debug: {
          fetchedCount: 0,
          exchanges: {},
        },
        error: 'No data from CEX APIs. This is normal if APIs are temporarily unavailable.',
      });
    }

    // Count by source (we track as single source but could break out by exchange)
    const exchangeCounts: Record<string, number> = {
      aggregated: cexData.length,
    };

    // Delete old snapshots (older than 24h)
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const deleteResult = await prisma.cexMarketSnapshot.deleteMany({
        where: {
          createdAt: {
            lt: oneDayAgo,
          },
        },
      });
      if (deleteResult.count > 0) {
        console.log(`[sync-cex-snapshots] Deleted ${deleteResult.count} old snapshots`);
      }
    } catch (cleanupError) {
      console.error('[sync-cex-snapshots] Cleanup error (non-fatal):', cleanupError);
    }

    // Build snapshot data with explicit IDs
    const data = cexData.map((item: CexSnapshotInput) => ({
      id: randomUUID(),
      symbol: item.symbol,
      baseAsset: item.baseAsset,
      quoteAsset: item.quoteAsset,
      source: item.source,
      priceUsd: item.priceUsd,
      volume24hUsd: item.volume24hUsd,
      openInterestUsd: item.openInterestUsd,
    }));

    console.log(`[sync-cex-snapshots] Inserting ${data.length} snapshots...`);

    // Insert snapshots
    const result = await withDbRetry(() =>
      prisma.cexMarketSnapshot.createMany({
        data,
      })
    );

    console.log(`[sync-cex-snapshots] Inserted ${result.count} snapshots`);

    return res.status(200).json({
      ok: true,
      snapshots: result.count,
      debug: {
        fetchedCount: cexData.length,
        exchanges: exchangeCounts,
      },
    });
  } catch (error: any) {
    console.error('[sync-cex-snapshots] Error:', error?.message || error);
    return res.status(500).json({
      ok: false,
      snapshots: 0,
      error: `Error: ${error?.message || 'Unknown error'}`,
    });
  }
}

