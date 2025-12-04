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

// Tracked tokens - TODO: Update with correct token addresses
const TRACKED_TOKENS = [
  { symbol: 'BTC', tokenAddress: '0x...', chain: 'ethereum' }, // TODO: Add correct BTC token address on Ethereum
  { symbol: 'ETH', tokenAddress: '0x0000000000000000000000000000000000000000', chain: 'ethereum' }, // Native ETH
  // TODO: Add more tokens (SOL, USDC, etc.) with correct addresses
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
    let totalProcessed = 0;
    let totalCreated = 0;
    const errors: string[] = [];

    // Calculate lookback window (last 30 minutes)
    const lookbackMinutes = 30;
    const sinceTimestamp = Math.floor((Date.now() - lookbackMinutes * 60 * 1000) / 1000);

    // Process each tracked token
    for (const token of TRACKED_TOKENS) {
      // Skip if token address is placeholder
      if (token.tokenAddress === '0x...' || !token.tokenAddress) {
        console.warn(`[WhaleEntries] Skipping ${token.symbol} - placeholder address`);
        continue;
      }

      try {
        // Fetch large transfers from Uniblock
        const transfers = await getLargeTokenTransfers({
          tokenAddress: token.tokenAddress,
          chain: token.chain,
          minUsd: 10000, // Minimum $10k USD
          sinceTimestamp: sinceTimestamp,
        });

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
            console.error(`[WhaleEntries] Error upserting transfer ${transfer.txHash}:`, error);
            errors.push(`Transfer ${transfer.txHash}: ${error?.message || 'Unknown error'}`);
          }
        }

        console.log(
          `[WhaleEntries] ✅ Processed ${transfers.length} transfers for ${token.symbol}, created ${transfers.length} entries`
        );
      } catch (error: any) {
        console.error(`[WhaleEntries] Error processing ${token.symbol}:`, error);
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

