/**
 * Token Whales Cron Job
 * 
 * Tracks large non-stable token transfers and generates liquidity signals for whale accumulation.
 * 
 * This endpoint should be called by external cron (cron-job.org, Vercel cron, etc.)
 * Protected with CRON_SECRET query parameter.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../../lib/prisma';
import { getLargeTokenTransfers } from '../../../../services/uniblock';

type Response = {
  ok: boolean;
  created: number;
  errors?: string[];
};

// Tracked tokens - user can extend this list
const TRACKED_TOKENS = [
  // { symbol: 'SOL', tokenAddress: '...', chain: 'solana' },
  // { symbol: 'WIF', tokenAddress: '...', chain: 'solana' },
  // { symbol: 'DEGEN', tokenAddress: '...', chain: 'base' },
  // TODO: Add real token addresses when available
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Response>
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
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
        created: 0,
        errors: ['Unauthorized'],
      });
    }
  }

  const lookbackMinutes = 60;
  const since = Math.floor((Date.now() - lookbackMinutes * 60 * 1000) / 1000);

  let created = 0;
  const errors: string[] = [];

  try {
    for (const t of TRACKED_TOKENS) {
      // Skip if token address is placeholder or missing
      if (!t.tokenAddress || t.tokenAddress === '0x...' || t.tokenAddress === '...') {
        continue;
      }

      try {
        const transfers = await getLargeTokenTransfers({
          tokenAddress: t.tokenAddress,
          chain: t.chain,
          minUsd: 25_000,
          sinceTimestamp: since,
        });

        if (!transfers.length) continue;

        const totalUsd = transfers.reduce((a, tr) => a + tr.amountUsd, 0);

        if (totalUsd < 50_000) continue;

        await withDbRetry(() =>
          prisma.liquiditySignal.create({
            data: {
              type: 'TOKEN_WHALE_ACCUMULATION',
              title: `Whales accumulating ${t.symbol}`,
              description: `Large buys into ${t.symbol} detected (~${Math.round(totalUsd).toLocaleString()} USD).`,
              severity: totalUsd > 250_000 ? 3 : 2,
              chain: t.chain,
              tokenSymbol: t.symbol,
              triggeredAt: new Date(),
            },
          })
        );

        created++;
      } catch (err: any) {
        console.error(`[TokenWhales] Error processing ${t.symbol}:`, err);
        errors.push(`${t.symbol}: ${err?.message || 'Unknown error'}`);
      }
    }

    return res.status(200).json({
      ok: true,
      created,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error('[TokenWhales] Fatal error:', err);
    return res.status(500).json({
      ok: false,
      created: 0,
      errors: [err?.message || 'Fatal error'],
    });
  }
}

