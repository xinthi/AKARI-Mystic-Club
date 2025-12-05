/**
 * Meme Token Snapshots Sync Cron
 * 
 * Fetches top memecoins from CoinGecko and stores as MemeTokenSnapshot records.
 * This enables the /portal/memes page to read from DB instead of live API calls.
 * 
 * Protected with CRON_SECRET (query param, Authorization header, or x-cron-secret header).
 * 
 * Fallback strategy:
 * 1. getTopPumpFunMemecoins() - tries meme-token, pump-fun categories, then keyword filter
 * 2. fetchMemesDirectly() - direct keyword-based fetch as last resort
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { prisma, withDbRetry } from '../../../../lib/prisma';
import { getTopPumpFunMemecoins, fetchMemesDirectly } from '../../../../services/memecoinRadar';

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
      console.log('[sync-meme-snapshots] Unauthorized request');
      return res.status(401).json({
        ok: false,
        snapshots: 0,
        error: 'Unauthorized',
      });
    }
  }

  let memes: Awaited<ReturnType<typeof getTopPumpFunMemecoins>> = [];
  let strategy = 'none';

  try {
    console.log('[sync-meme-snapshots] Starting sync...');
    
    // Strategy 1: getTopPumpFunMemecoins (has its own fallbacks)
    memes = await getTopPumpFunMemecoins(20);
    console.log('[sync-meme-snapshots] Strategy 1 (getTopPumpFunMemecoins): fetched', memes.length, 'memes');

    if (memes.length > 0) {
      strategy = 'getTopPumpFunMemecoins';
    } else {
      // Strategy 2: Direct keyword-based fetch as last resort
      console.log('[sync-meme-snapshots] Strategy 1 returned empty, trying Strategy 2 (fetchMemesDirectly)...');
      memes = await fetchMemesDirectly(20);
      console.log('[sync-meme-snapshots] Strategy 2 (fetchMemesDirectly): fetched', memes.length, 'memes');
      
      if (memes.length > 0) {
        strategy = 'fetchMemesDirectly';
      }
    }

  } catch (error: any) {
    // Real API error - return 500
    console.error('[sync-meme-snapshots] Exception fetching memes:', error?.message || error);
    return res.status(500).json({
      ok: false,
      snapshots: 0,
      error: `Exception: ${error?.message || 'Unknown error'}`,
      debug: { fetchedCount: 0, strategy: 'exception' },
    });
  }

  // If memes is still empty after all fallbacks
  if (memes.length === 0) {
    console.log('[sync-meme-snapshots] All strategies exhausted - no meme coins found');
    return res.status(200).json({
      ok: true,
      snapshots: 0,
      error: 'No meme coins found after all fallbacks. API may be rate-limited or no meme coins match keywords.',
      debug: { fetchedCount: 0, strategy: 'all_exhausted' },
    });
  }

  try {
    console.log('[sync-meme-snapshots] memes.length =', memes.length, 'strategy =', strategy);
    
    // Build snapshot data with explicit IDs
    const data = memes.map((m) => ({
      id: randomUUID(),
      symbol: m.symbol,
      name: m.name,
      priceUsd: m.priceUsd ?? 0,
      marketCapUsd: m.marketCapUsd ?? null,
      change24hPct: m.priceChange24h ?? null,
      source: 'coingecko_meme',
    }));

    console.log('[sync-meme-snapshots] Inserting', data.length, 'snapshots...');

    // Insert snapshots
    const result = await withDbRetry(() =>
      prisma.memeTokenSnapshot.createMany({
        data,
      })
    );

    console.log('[sync-meme-snapshots] Inserted', result.count, 'snapshots');

    // Cleanup: delete old snapshots (wrapped in try/catch so it doesn't fail the request)
    try {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const deleteResult = await prisma.memeTokenSnapshot.deleteMany({
        where: {
          createdAt: {
            lt: twoDaysAgo,
          },
        },
      });
      if (deleteResult.count > 0) {
        console.log('[sync-meme-snapshots] Deleted', deleteResult.count, 'old snapshots');
      }
    } catch (cleanupError) {
      console.error('[sync-meme-snapshots] Cleanup error (non-fatal):', cleanupError);
    }

    return res.status(200).json({
      ok: true,
      snapshots: result.count,
      debug: { fetchedCount: memes.length, strategy },
    });
  } catch (error: any) {
    console.error('[sync-meme-snapshots] Database error:', error?.message || error);
    return res.status(500).json({
      ok: false,
      snapshots: 0,
      error: `Database error: ${error?.message || 'Unknown error'}`,
      debug: { fetchedCount: memes.length, strategy },
    });
  }
}
