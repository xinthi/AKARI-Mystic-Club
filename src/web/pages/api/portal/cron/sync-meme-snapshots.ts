/**
 * Meme Token Snapshots Sync Cron
 * 
 * Fetches top Pump.fun memecoins from CoinGecko and stores as MemeTokenSnapshot records.
 * This enables the /portal/memes page to read from DB instead of live API calls.
 * 
 * Protected with CRON_SECRET (query param, Authorization header, or x-cron-secret header).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { prisma, withDbRetry } from '../../../../lib/prisma';
import { getTopPumpFunMemecoins } from '../../../../services/memecoinRadar';

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
      console.log('[sync-meme-snapshots] Unauthorized request');
      return res.status(401).json({
        ok: false,
        snapshots: 0,
        error: 'Unauthorized',
      });
    }
  }

  let memes: Awaited<ReturnType<typeof getTopPumpFunMemecoins>> | null = null;

  try {
    console.log('[sync-meme-snapshots] Starting sync...');
    
    // Fetch top Pump.fun memecoins from CoinGecko
    memes = await getTopPumpFunMemecoins(20);
    console.log('[sync-meme-snapshots] fetched memes:', memes?.length ?? 0);

  } catch (error: any) {
    // Real API error - return 500
    console.error('[sync-meme-snapshots] Exception fetching memes:', error?.message || error);
    return res.status(500).json({
      ok: false,
      snapshots: 0,
      error: `Exception: ${error?.message || 'Unknown error'}`,
      debug: { fetchedCount: 0 },
    });
  }

  // If memes is null (API completely failed), return error
  if (memes === null) {
    console.error('[sync-meme-snapshots] CoinGecko returned null (API failure)');
    return res.status(502).json({
      ok: false,
      snapshots: 0,
      error: 'CoinGecko API returned null. Check Vercel logs for details.',
      debug: { fetchedCount: 0 },
    });
  }

  // If memes is empty array (API worked but no data after all fallbacks)
  if (memes.length === 0) {
    console.log('[sync-meme-snapshots] CoinGecko responded but returned 0 memecoins after all fallbacks');
    return res.status(200).json({
      ok: true,
      snapshots: 0,
      error: 'CoinGecko responded but returned 0 memecoins (after fallbacks).',
      debug: { fetchedCount: 0 },
    });
  }

  try {
    // Build snapshot data with explicit IDs
    const data = memes.map((m) => ({
      id: randomUUID(),
      symbol: m.symbol,
      name: m.name,
      priceUsd: m.priceUsd ?? 0,
      marketCapUsd: m.marketCapUsd ?? null,
      change24hPct: m.priceChange24h ?? null,
      source: 'coingecko_pumpfun',
    }));

    console.log('[sync-meme-snapshots] Inserting', data.length, 'snapshots...');

    // Insert snapshots
    const result = await withDbRetry(() =>
      prisma.memeTokenSnapshot.createMany({
        data,
      })
    );

    console.log('[sync-meme-snapshots] inserted snapshots:', result.count);

    // Optional: cleanup old snapshots (wrapped in try/catch so it doesn't fail the request)
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
      debug: { fetchedCount: memes.length },
    });
  } catch (error: any) {
    console.error('[sync-meme-snapshots] Database error:', error?.message || error);
    return res.status(500).json({
      ok: false,
      snapshots: 0,
      error: `Database error: ${error?.message || 'Unknown error'}`,
      debug: { fetchedCount: memes.length },
    });
  }
}
