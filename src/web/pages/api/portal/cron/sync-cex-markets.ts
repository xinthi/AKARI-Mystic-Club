/**
 * CEX Markets Sync Cron
 * 
 * Fetches CEX market data (spot prices, volume, funding rates) from Binance and OKX
 * for major tokens in MarketSnapshot, then stores as CexMarketSnapshot.
 * 
 * Protected with CRON_SECRET (query param, Authorization header, or x-cron-secret header).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { prisma, withDbRetry } from '../../../../lib/prisma';
import { getCexMarketsForSymbols, type CexMarketInfo } from '../../../../services/cexAggregator';

type SyncResponse = {
  ok: boolean;
  updated: number;
  exchanges: {
    binance: number;
    okx: number;
  };
  error?: string;
  debug?: {
    symbolsQueried: number;
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
      exchanges: { binance: 0, okx: 0 },
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
      console.log('[sync-cex-markets] Unauthorized request');
      return res.status(401).json({
        ok: false,
        updated: 0,
        exchanges: { binance: 0, okx: 0 },
        error: 'Unauthorized',
      });
    }
  }

  try {
    console.log('[sync-cex-markets] Starting sync...');

    // 1. Load symbols from MarketSnapshot (majors only - likely to have CEX listings)
    const marketSnapshots = await prisma.marketSnapshot.findMany({
      select: { symbol: true },
      orderBy: { marketCapUsd: 'desc' },
      take: 50,
    });

    // Build deduplicated symbol list (uppercase)
    const symbols = [...new Set(
      marketSnapshots
        .map(s => s.symbol.toUpperCase())
        .filter(s => s.length <= 10) // Filter out long symbols unlikely to be on CEX
    )];

    console.log(`[sync-cex-markets] Querying CEX data for ${symbols.length} symbols`);

    if (symbols.length === 0) {
      console.log('[sync-cex-markets] No symbols to query');
      return res.status(200).json({
        ok: true,
        updated: 0,
        exchanges: { binance: 0, okx: 0 },
        error: 'No symbols to query (MarketSnapshot may be empty)',
        debug: { symbolsQueried: 0, resultsReceived: 0 },
      });
    }

    // 2. Fetch CEX market data
    const cexResults = await getCexMarketsForSymbols(symbols);
    console.log(`[sync-cex-markets] Received ${cexResults.length} CEX results`);

    if (cexResults.length === 0) {
      console.log('[sync-cex-markets] No CEX data found');
      return res.status(200).json({
        ok: true,
        updated: 0,
        exchanges: { binance: 0, okx: 0 },
        error: 'No CEX data found for any symbols',
        debug: { symbolsQueried: symbols.length, resultsReceived: 0 },
      });
    }

    // 3. Count exchanges
    const exchangeCounts = {
      binance: 0,
      okx: 0,
    };
    
    for (const r of cexResults) {
      if (r.exchange === 'binance') exchangeCounts.binance++;
      else if (r.exchange === 'okx') exchangeCounts.okx++;
    }

    // 4. Delete old snapshots (older than 24h)
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const deleteResult = await prisma.cexMarketSnapshot.deleteMany({
        where: {
          updatedAt: {
            lt: oneDayAgo,
          },
        },
      });
      if (deleteResult.count > 0) {
        console.log(`[sync-cex-markets] Deleted ${deleteResult.count} old snapshots`);
      }
    } catch (cleanupError) {
      console.error('[sync-cex-markets] Cleanup error (non-fatal):', cleanupError);
    }

    // 5. Upsert CEX market snapshots
    let upsertCount = 0;
    
    for (const result of cexResults) {
      try {
        await withDbRetry(() =>
          prisma.cexMarketSnapshot.upsert({
            where: {
              exchange_pairCode: {
                exchange: result.exchange,
                pairCode: result.pairCode,
              },
            },
            update: {
              symbol: result.symbol,
              baseSymbol: result.baseSymbol,
              quoteSymbol: result.quoteSymbol,
              priceUsd: result.priceUsd,
              volume24hUsd: result.volume24hUsd,
              high24h: result.high24h,
              low24h: result.low24h,
              priceChange24h: result.priceChange24h,
              fundingRate: result.fundingRate,
              openInterestUsd: result.openInterestUsd,
              updatedAt: new Date(),
            },
            create: {
              id: randomUUID(),
              symbol: result.symbol,
              baseSymbol: result.baseSymbol,
              quoteSymbol: result.quoteSymbol,
              exchange: result.exchange,
              pairCode: result.pairCode,
              priceUsd: result.priceUsd,
              volume24hUsd: result.volume24hUsd,
              high24h: result.high24h,
              low24h: result.low24h,
              priceChange24h: result.priceChange24h,
              fundingRate: result.fundingRate,
              openInterestUsd: result.openInterestUsd,
            },
          })
        );
        upsertCount++;
      } catch (upsertError) {
        console.error(`[sync-cex-markets] Upsert error for ${result.symbol}:`, upsertError);
      }
    }

    console.log(`[sync-cex-markets] Successfully upserted ${upsertCount} snapshots`);

    return res.status(200).json({
      ok: true,
      updated: upsertCount,
      exchanges: exchangeCounts,
      debug: { symbolsQueried: symbols.length, resultsReceived: cexResults.length },
    });

  } catch (error: any) {
    console.error('[sync-cex-markets] Error:', error?.message || error);
    return res.status(500).json({
      ok: false,
      updated: 0,
      exchanges: { binance: 0, okx: 0 },
      error: `Error: ${error?.message || 'Unknown error'}`,
    });
  }
}

