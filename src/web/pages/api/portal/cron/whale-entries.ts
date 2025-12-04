/**
 * Whale Entries Cron Job
 * 
 * Fetches large token transfers from Uniblock and stores them as WhaleEntry records.
 * 
 * This endpoint should be called by external cron (cron-job.org, Vercel cron, etc.)
 * Protected with CRON_SECRET query parameter.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../../lib/prisma';
import { getLargeTokenTransfers } from '../../../../services/uniblock';

type WhaleEntriesResponse = {
  ok: boolean;
  processed: number;
  created: number;
  errors?: string[];
};

// Tracked tokens - Currently tracking USDT (ERC20) for testing
const TRACKED_TOKENS = [
  {
    symbol: 'USDT',
    tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    chain: 'ethereum',
  },
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WhaleEntriesResponse>
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      processed: 0,
      created: 0,
      errors: ['Method not allowed'],
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
        processed: 0,
        created: 0,
        errors: ['Unauthorized'],
      });
    }
  }

  try {
    console.log('[WhaleEntries Cron] Running cron at', new Date().toISOString());

    let totalProcessed = 0;
    let totalCreated = 0;
    const errors: string[] = [];

    // Calculate lookback window (last 4 hours for testing)
    const lookbackMinutes = 240; // 4 hours
    const sinceTimestamp = Math.floor((Date.now() - lookbackMinutes * 60 * 1000) / 1000);

    // Process each tracked token
    for (const token of TRACKED_TOKENS) {
      // Skip if token address is placeholder
      if (token.tokenAddress === '0x...' || !token.tokenAddress) {
        console.warn(`[WhaleEntries Cron] Skipping ${token.symbol} - placeholder address`);
        continue;
      }

      console.log(`[WhaleEntries Cron] Fetching transfers for ${token.symbol}`);

      try {
        // Fetch large transfers from Uniblock (relaxed to $1k for testing)
        const transfers = await getLargeTokenTransfers({
          tokenAddress: token.tokenAddress,
          chain: token.chain,
          minUsd: 1000, // Minimum $1k USD (relaxed for testing)
          sinceTimestamp: sinceTimestamp,
        });

        console.log(`[WhaleEntries Cron] Finished ${token.symbol}: found ${transfers.length} transfers`);
        totalProcessed += transfers.length;

        // Upsert each transfer
        for (const transfer of transfers) {
          try {
            await withDbRetry(() =>
              prisma.whaleEntry.upsert({
                where: { txHash: transfer.txHash },
                create: {
                  tokenSymbol: token.symbol,
                  tokenAddress: transfer.tokenAddress,
                  chain: transfer.chain,
                  wallet: transfer.wallet,
                  amountUsd: transfer.amountUsd,
                  txHash: transfer.txHash,
                  occurredAt: new Date(transfer.occurredAt),
                },
                update: {}, // Don't update if already exists
              })
            );
            totalCreated += 1;
          } catch (error: any) {
            console.error(`[WhaleEntries Cron] Error upserting transfer ${transfer.txHash}:`, error);
            errors.push(`Transfer ${transfer.txHash}: ${error?.message || 'Unknown error'}`);
          }
        }

        console.log(
          `[WhaleEntries Cron] ✅ Processed ${transfers.length} transfers for ${token.symbol}, created ${totalCreated} entries`
        );
      } catch (error: any) {
        console.error(`[WhaleEntries Cron] Error processing ${token.symbol}:`, error);
        errors.push(`${token.symbol}: ${error?.message || 'Unknown error'}`);
        // Continue to next token
      }
    }

    console.log(
      `[WhaleEntries] Summary: processed=${totalProcessed}, created=${totalCreated}`
    );

    return res.status(200).json({
      ok: true,
      processed: totalProcessed,
      created: totalCreated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[WhaleEntries] Fatal error:', error);
    return res.status(500).json({
      ok: false,
      processed: 0,
      created: 0,
      errors: [error?.message || 'Internal server error'],
    });
  }
}

