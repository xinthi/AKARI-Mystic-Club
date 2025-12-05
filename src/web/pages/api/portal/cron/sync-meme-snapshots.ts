/**
 * Meme Token Snapshots Sync Cron
 * 
 * Fetches top Pump.fun memecoins from CoinGecko and stores as MemeTokenSnapshot records.
 * This enables the /portal/memes page to read from DB instead of live API calls.
 * 
 * Protected with CRON_SECRET (query param or Authorization header).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../../lib/prisma';
import { getTopPumpFunMemecoins } from '../../../../services/memecoinRadar';

type SyncResponse = {
  ok: boolean;
  snapshots: number;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SyncResponse>
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      snapshots: 0,
      error: 'Method not allowed',
    });
  }

  // Check CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const providedSecret =
      req.headers.authorization?.replace('Bearer ', '') ||
      (req.headers['x-cron-secret'] as string | undefined) ||
      (req.query.secret as string | undefined);

    if (providedSecret !== cronSecret) {
      return res.status(401).json({
        ok: false,
        snapshots: 0,
        error: 'Unauthorized',
      });
    }
  }

  try {
    // Fetch top Pump.fun memecoins from CoinGecko
    const memecoins = await getTopPumpFunMemecoins(20);

    if (memecoins.length === 0) {
      console.log('[SyncMemeSnapshots] No memecoins returned from CoinGecko');
      return res.status(200).json({
        ok: true,
        snapshots: 0,
      });
    }

    console.log(`[SyncMemeSnapshots] Fetched ${memecoins.length} memecoins`);

    // Create MemeTokenSnapshot records for each coin
    const now = new Date();
    const snapshotData = memecoins.map((coin) => ({
      symbol: coin.symbol,
      name: coin.name,
      priceUsd: coin.priceUsd,
      marketCapUsd: coin.marketCapUsd ?? null,
      change24hPct: coin.priceChange24h ?? null,
      source: 'coingecko_pumpfun',
      createdAt: now,
    }));

    await withDbRetry(() =>
      prisma.memeTokenSnapshot.createMany({
        data: snapshotData,
      })
    );

    // Optionally delete old snapshots older than 2 days to keep the table light
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const deleteResult = await withDbRetry(() =>
      prisma.memeTokenSnapshot.deleteMany({
        where: {
          createdAt: {
            lt: twoDaysAgo,
          },
        },
      })
    );

    if (deleteResult.count > 0) {
      console.log(`[SyncMemeSnapshots] Deleted ${deleteResult.count} old snapshots`);
    }

    console.log(`[SyncMemeSnapshots] Created ${snapshotData.length} snapshots`);

    return res.status(200).json({
      ok: true,
      snapshots: snapshotData.length,
    });
  } catch (error: any) {
    console.error('[SyncMemeSnapshots] Error:', error);
    return res.status(500).json({
      ok: false,
      snapshots: 0,
      error: error?.message || 'Internal server error',
    });
  }
}

