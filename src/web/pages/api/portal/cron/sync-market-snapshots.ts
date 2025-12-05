/**
 * Market Snapshots Sync Cron
 * 
 * Fetches trending coins from CoinGecko and stores as MarketSnapshot records.
 * This enables the /portal/markets page to read from DB instead of live API calls.
 * 
 * Protected with CRON_SECRET (query param or Authorization header).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../../lib/prisma';
import { getTrendingCoinsWithPrices } from '../../../../services/coingecko';

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
    // Fetch trending coins from CoinGecko
    const trendingCoins = await getTrendingCoinsWithPrices();

    if (trendingCoins.length === 0) {
      console.log('[SyncMarketSnapshots] No trending coins returned from CoinGecko');
      return res.status(200).json({
        ok: true,
        snapshots: 0,
      });
    }

    console.log(`[SyncMarketSnapshots] Fetched ${trendingCoins.length} trending coins`);

    // Create MarketSnapshot records for each coin
    const now = new Date();
    const snapshotData = trendingCoins.map((coin) => ({
      symbol: coin.symbol,
      name: coin.name,
      priceUsd: coin.priceUsd,
      marketCapUsd: coin.marketCapUsd ?? null,
      volume24hUsd: coin.volume24hUsd ?? null,
      change24hPct: coin.change24hPct ?? null,
      source: 'coingecko_trending',
      createdAt: now,
    }));

    await withDbRetry(() =>
      prisma.marketSnapshot.createMany({
        data: snapshotData,
      })
    );

    // Optionally delete old snapshots older than 2 days to keep the table light
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const deleteResult = await withDbRetry(() =>
      prisma.marketSnapshot.deleteMany({
        where: {
          createdAt: {
            lt: twoDaysAgo,
          },
        },
      })
    );

    if (deleteResult.count > 0) {
      console.log(`[SyncMarketSnapshots] Deleted ${deleteResult.count} old snapshots`);
    }

    console.log(`[SyncMarketSnapshots] Created ${snapshotData.length} snapshots`);

    return res.status(200).json({
      ok: true,
      snapshots: snapshotData.length,
    });
  } catch (error: any) {
    console.error('[SyncMarketSnapshots] Error:', error);
    return res.status(500).json({
      ok: false,
      snapshots: 0,
      error: error?.message || 'Internal server error',
    });
  }
}

