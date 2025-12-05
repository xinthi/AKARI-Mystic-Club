/**
 * Market Snapshots Sync Cron
 * 
 * Fetches trending coins from CoinGecko and stores as MarketSnapshot records.
 * This enables the /portal/markets page to read from DB instead of live API calls.
 * 
 * Protected with CRON_SECRET (query param, Authorization header, or x-cron-secret header).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { prisma, withDbRetry } from '../../../../lib/prisma';
import { getTrendingCoinsWithPrices } from '../../../../services/coingecko';

type SyncResponse = {
  ok: boolean;
  snapshots: number;
  error?: string;
  debug?: {
    fetchedCount?: number;
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

  let coins: Awaited<ReturnType<typeof getTrendingCoinsWithPrices>> | null = null;

  try {
    console.log('[sync-market-snapshots] Starting sync...');
    
    // Fetch trending coins from CoinGecko
    coins = await getTrendingCoinsWithPrices();
    console.log('[sync-market-snapshots] fetched coins:', coins?.length ?? 0);

  } catch (error: any) {
    // Real API error - return 500
    console.error('[sync-market-snapshots] Exception fetching coins:', error?.message || error);
    return res.status(500).json({
      ok: false,
      snapshots: 0,
      error: `Exception: ${error?.message || 'Unknown error'}`,
      debug: { fetchedCount: 0 },
    });
  }

  // If coins is null (API completely failed), return error
  if (coins === null) {
    console.error('[sync-market-snapshots] CoinGecko returned null (API failure)');
    return res.status(502).json({
      ok: false,
      snapshots: 0,
      error: 'CoinGecko API returned null. Check Vercel logs for details.',
      debug: { fetchedCount: 0 },
    });
  }

  // If coins is empty array (API worked but no data after all fallbacks)
  if (coins.length === 0) {
    console.log('[sync-market-snapshots] CoinGecko responded but returned 0 coins after all fallbacks');
    return res.status(200).json({
      ok: true,
      snapshots: 0,
      error: 'CoinGecko responded but returned 0 coins (after fallbacks).',
      debug: { fetchedCount: 0 },
    });
  }

  try {
    // Build snapshot data with explicit IDs
    const data = coins.map((c) => ({
      id: randomUUID(),
      symbol: c.symbol,
      name: c.name,
      priceUsd: c.priceUsd ?? 0,
      marketCapUsd: c.marketCapUsd ?? null,
      volume24hUsd: c.volume24hUsd ?? null,
      change24hPct: c.change24hPct ?? null,
      source: 'coingecko_trending',
    }));

    console.log('[sync-market-snapshots] Inserting', data.length, 'snapshots...');

    // Insert snapshots
    const result = await withDbRetry(() =>
      prisma.marketSnapshot.createMany({
        data,
      })
    );

    console.log('[sync-market-snapshots] inserted snapshots:', result.count);

    // Optional: cleanup old snapshots (wrapped in try/catch so it doesn't fail the request)
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
      debug: { fetchedCount: coins.length },
    });
  } catch (error: any) {
    console.error('[sync-market-snapshots] Database error:', error?.message || error);
    return res.status(500).json({
      ok: false,
      snapshots: 0,
      error: `Database error: ${error?.message || 'Unknown error'}`,
      debug: { fetchedCount: coins.length },
    });
  }
}
