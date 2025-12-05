/**
 * DEX Markets Sync Cron
 * 
 * Fetches DEX market data (liquidity, volume) from DexScreener, GeckoTerminal, and Birdeye
 * for tokens in MarketSnapshot and MemeTokenSnapshot, then stores as DexMarketSnapshot.
 * 
 * Protected with CRON_SECRET (query param, Authorization header, or x-cron-secret header).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { prisma, withDbRetry } from '../../../../lib/prisma';
import { getDexMarketsForSymbols, type TokenQuery, type DexMarketInfo } from '../../../../services/dexAggregator';

type SyncResponse = {
  ok: boolean;
  updated: number;
  sources: {
    dexscreener: number;
    geckoterminal: number;
    birdeye: number;
  };
  error?: string;
  debug?: {
    tokensQueried: number;
    resultsReceived: number;
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
      updated: 0,
      sources: { dexscreener: 0, geckoterminal: 0, birdeye: 0 },
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
      console.log('[sync-dex-markets] Unauthorized request');
      return res.status(401).json({
        ok: false,
        updated: 0,
        sources: { dexscreener: 0, geckoterminal: 0, birdeye: 0 },
        error: 'Unauthorized',
      });
    }
  }

  try {
    console.log('[sync-dex-markets] Starting sync...');

    // 1. Load symbols from MarketSnapshot and MemeTokenSnapshot
    const [marketSnapshots, memeSnapshots] = await Promise.all([
      prisma.marketSnapshot.findMany({
        select: { symbol: true, name: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.memeTokenSnapshot.findMany({
        select: { symbol: true, name: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    // Build deduplicated token list
    const symbolMap = new Map<string, TokenQuery>();
    
    for (const snap of marketSnapshots) {
      const key = snap.symbol.toUpperCase();
      if (!symbolMap.has(key)) {
        symbolMap.set(key, { symbol: snap.symbol });
      }
    }
    
    for (const snap of memeSnapshots) {
      const key = snap.symbol.toUpperCase();
      if (!symbolMap.has(key)) {
        // Meme tokens are often on Solana
        symbolMap.set(key, { symbol: snap.symbol, chain: 'solana' });
      }
    }

    const tokens = Array.from(symbolMap.values());
    console.log(`[sync-dex-markets] Querying DEX data for ${tokens.length} tokens`);

    // 2. Fetch DEX market data
    const dexResults = await getDexMarketsForSymbols(tokens);
    console.log(`[sync-dex-markets] Received ${dexResults.length} DEX results`);

    if (dexResults.length === 0) {
      console.log('[sync-dex-markets] No DEX data found');
      return res.status(200).json({
        ok: true,
        updated: 0,
        sources: { dexscreener: 0, geckoterminal: 0, birdeye: 0 },
        error: 'No DEX data found for any tokens',
        debug: { tokensQueried: tokens.length, resultsReceived: 0 },
      });
    }

    // 3. Count sources
    const sourceCounts = {
      dexscreener: 0,
      geckoterminal: 0,
      birdeye: 0,
    };
    
    for (const r of dexResults) {
      if (r.dexSource === 'dexscreener') sourceCounts.dexscreener++;
      else if (r.dexSource === 'geckoterminal') sourceCounts.geckoterminal++;
      else if (r.dexSource === 'birdeye') sourceCounts.birdeye++;
    }

    // 4. Delete old snapshots (older than 24h)
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const deleteResult = await prisma.dexMarketSnapshot.deleteMany({
        where: {
          updatedAt: {
            lt: oneDayAgo,
          },
        },
      });
      if (deleteResult.count > 0) {
        console.log(`[sync-dex-markets] Deleted ${deleteResult.count} old snapshots`);
      }
    } catch (cleanupError) {
      console.error('[sync-dex-markets] Cleanup error (non-fatal):', cleanupError);
    }

    // 5. Upsert DEX market snapshots
    let upsertCount = 0;
    
    for (const result of dexResults) {
      try {
        await withDbRetry(() =>
          prisma.dexMarketSnapshot.upsert({
            where: {
              dexSource_chain_address: {
                dexSource: result.dexSource,
                chain: result.chain,
                address: result.address,
              },
            },
            update: {
              symbol: result.symbol,
              name: result.name,
              pairAddress: result.pairAddress,
              dexName: result.dexName,
              priceUsd: result.priceUsd,
              liquidityUsd: result.liquidityUsd,
              volume24hUsd: result.volume24hUsd,
              fdvUsd: result.fdvUsd,
              baseToken: result.baseToken,
              quoteToken: result.quoteToken,
              priceChange24h: result.priceChange24h,
              txns24h: result.txns24h,
              updatedAt: new Date(),
            },
            create: {
              id: randomUUID(),
              symbol: result.symbol,
              name: result.name,
              chain: result.chain,
              address: result.address,
              pairAddress: result.pairAddress,
              dexSource: result.dexSource,
              dexName: result.dexName,
              priceUsd: result.priceUsd,
              liquidityUsd: result.liquidityUsd,
              volume24hUsd: result.volume24hUsd,
              fdvUsd: result.fdvUsd,
              baseToken: result.baseToken,
              quoteToken: result.quoteToken,
              priceChange24h: result.priceChange24h,
              txns24h: result.txns24h,
            },
          })
        );
        upsertCount++;
      } catch (upsertError) {
        console.error(`[sync-dex-markets] Upsert error for ${result.symbol}:`, upsertError);
      }
    }

    console.log(`[sync-dex-markets] Successfully upserted ${upsertCount} snapshots`);

    return res.status(200).json({
      ok: true,
      updated: upsertCount,
      sources: sourceCounts,
      debug: { tokensQueried: tokens.length, resultsReceived: dexResults.length },
    });

  } catch (error: any) {
    console.error('[sync-dex-markets] Error:', error?.message || error);
    return res.status(500).json({
      ok: false,
      updated: 0,
      sources: { dexscreener: 0, geckoterminal: 0, birdeye: 0 },
      error: `Error: ${error?.message || 'Unknown error'}`,
    });
  }
}

