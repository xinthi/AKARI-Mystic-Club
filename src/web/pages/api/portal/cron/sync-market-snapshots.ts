/**
 * Market Snapshots Sync Cron
 * 
 * Fetches trending coins from CoinGecko and stores as MarketSnapshot records.
 * This enables the /portal/markets page to read from DB instead of live API calls.
 * 
 * Protected with CRON_SECRET (query param, Authorization header, or x-cron-secret header).
 * 
 * Fallback strategy:
 * 1. getTrendingCoinsWithPrices() - full params
 * 2. fetchMarketsDirectly() - simpler params as last resort
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { prisma, withDbRetry } from '../../../../lib/prisma';
import { getTrendingCoinsWithPrices, fetchMarketsDirectly } from '../../../../services/coingecko';

type SyncResponse = {
  ok: boolean;
  snapshots: number;
  error?: string;
  debug?: {
    fetchedCount?: number;
    strategy?: string;
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
      console.log('[sync-market-snapshots] Unauthorized request');
      return res.status(401).json({
        ok: false,
        snapshots: 0,
        error: 'Unauthorized',
      });
    }
  }

  let coins: Awaited<ReturnType<typeof getTrendingCoinsWithPrices>> = [];
  let strategy = 'none';

  try {
    console.log('[sync-market-snapshots] Starting sync...');
    
    // Strategy 1: getTrendingCoinsWithPrices (has its own fallbacks)
    coins = await getTrendingCoinsWithPrices();
    console.log('[sync-market-snapshots] Strategy 1 (getTrendingCoinsWithPrices): fetched', coins.length, 'coins');

    if (coins.length > 0) {
      strategy = 'getTrendingCoinsWithPrices';
    } else {
      // Strategy 2: Direct markets fetch as last resort
      console.log('[sync-market-snapshots] Strategy 1 returned empty, trying Strategy 2 (fetchMarketsDirectly)...');
      coins = await fetchMarketsDirectly(30);
      console.log('[sync-market-snapshots] Strategy 2 (fetchMarketsDirectly): fetched', coins.length, 'coins');
      
      if (coins.length > 0) {
        strategy = 'fetchMarketsDirectly';
      }
    }

  } catch (error: any) {
    // Real API error - return 500
    console.error('[sync-market-snapshots] Exception fetching coins:', error?.message || error);
    return res.status(500).json({
      ok: false,
      snapshots: 0,
      error: `Exception: ${error?.message || 'Unknown error'}`,
      debug: { fetchedCount: 0, strategy: 'exception' },
    });
  }

  // If coins is still empty after all fallbacks
  if (coins.length === 0) {
    console.log('[sync-market-snapshots] All strategies exhausted - CoinGecko returned 0 coins');
    return res.status(200).json({
      ok: true,
      snapshots: 0,
      error: 'CoinGecko returned 0 coins after all fallbacks. API may be rate-limited or unavailable.',
      debug: { fetchedCount: 0, strategy: 'all_exhausted' },
    });
  }

  try {
    console.log('[sync-market-snapshots] coins.length =', coins.length, 'strategy =', strategy);
    
    // Build snapshot data with explicit IDs
    const data = coins.map((c) => ({
      id: randomUUID(),
      symbol: c.symbol,
      name: c.name,
      priceUsd: c.priceUsd ?? 0,
      marketCapUsd: c.marketCapUsd ?? null,
      volume24hUsd: c.volume24hUsd ?? null,
      change24hPct: c.change24hPct ?? null,
      source: 'coingecko',
    }));

    console.log('[sync-market-snapshots] Inserting', data.length, 'snapshots...');

    // Insert snapshots
    const result = await withDbRetry(() =>
      prisma.marketSnapshot.createMany({
        data,
      })
    );

    console.log('[sync-market-snapshots] Inserted', result.count, 'snapshots');

    // Cleanup: delete old snapshots (wrapped in try/catch so it doesn't fail the request)
    try {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const deleteResult = await prisma.marketSnapshot.deleteMany({
        where: {
          createdAt: {
            lt: twoDaysAgo,
          },
        },
      });
      if (deleteResult.count > 0) {
        console.log('[sync-market-snapshots] Deleted', deleteResult.count, 'old snapshots');
      }
    } catch (cleanupError) {
      console.error('[sync-market-snapshots] Cleanup error (non-fatal):', cleanupError);
    }

    return res.status(200).json({
      ok: true,
      snapshots: result.count,
      debug: { fetchedCount: coins.length, strategy },
    });
  } catch (error: any) {
    console.error('[sync-market-snapshots] Database error:', error?.message || error);
    return res.status(500).json({
      ok: false,
      snapshots: 0,
      error: `Database error: ${error?.message || 'Unknown error'}`,
      debug: { fetchedCount: coins.length, strategy },
    });
  }
}
