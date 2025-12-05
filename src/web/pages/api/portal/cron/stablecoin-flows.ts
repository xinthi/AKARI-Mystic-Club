/**
 * Stablecoin Flows Cron Job
 * 
 * Tracks stablecoin (USDT, USDC) flows between chains and generates liquidity signals.
 * 
 * This endpoint should be called by external cron (cron-job.org, Vercel cron, etc.)
 * Protected with CRON_SECRET query parameter.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../../lib/prisma';
import { getRecentStablecoinTransfers } from '../../../../services/uniblock';

const CHAINS = ['ethereum', 'solana', 'base'] as const;
type Chain = (typeof CHAINS)[number];

const STABLES: ('USDT' | 'USDC')[] = ['USDT', 'USDC'];

type Response = {
  ok: boolean;
  snapshots: number;
  errors?: string[];
};

async function generateLiquiditySignals(windowStart: Date, windowEnd: Date) {
  const since = new Date(windowEnd.getTime() - 6 * 60 * 60 * 1000); // lookback 6h of snapshots

  const flows = await prisma.stablecoinFlowSnapshot.findMany({
    where: {
      windowEnd: { gte: since },
    },
  });

  const now = new Date();

  const sum = (stable: string, chain: string) =>
    flows
      .filter((f) => f.stableSymbol === stable && f.toChain === chain)
      .reduce((acc, f) => acc + f.netAmountUsd, 0);

  const usdtSol = sum('USDT', 'solana');
  const usdcBase = sum('USDC', 'base');
  const usdtEth = sum('USDT', 'ethereum');

  const signals: {
    type: string;
    title: string;
    description: string;
    severity: number;
    chain: string;
    stableSymbol: string;
  }[] = [];

  if (usdtSol > 500_000) {
    signals.push({
      type: 'SOL_MEME_SEASON',
      title: 'Massive USDT inflow to Solana',
      description: 'Stablecoin liquidity is rotating into Solana. Meme season signal triggered.',
      severity: usdtSol > 2_000_000 ? 3 : 2,
      chain: 'solana',
      stableSymbol: 'USDT',
    });
  }

  if (usdcBase > 300_000) {
    signals.push({
      type: 'BASE_SOCIALFI',
      title: 'USDC inflow to Base',
      description: 'Fresh USDC capital is entering Base. SocialFi / degen app rotation likely.',
      severity: usdcBase > 1_500_000 ? 3 : 2,
      chain: 'base',
      stableSymbol: 'USDC',
    });
  }

  if (usdtEth < -400_000) {
    signals.push({
      type: 'ETH_RISK_OFF',
      title: 'USDT outflow from Ethereum',
      description: 'Net USDT is leaving Ethereum. Risk-off / rotation into alt L1s possible.',
      severity: usdtEth < -1_500_000 ? 3 : 2,
      chain: 'ethereum',
      stableSymbol: 'USDT',
    });
  }

  for (const s of signals) {
    await prisma.liquiditySignal.create({
      data: {
        type: s.type,
        title: s.title,
        description: s.description,
        severity: s.severity,
        chain: s.chain,
        stableSymbol: s.stableSymbol,
        triggeredAt: now,
      },
    });
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Response>
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      snapshots: 0,
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
        snapshots: 0,
        errors: ['Unauthorized'],
      });
    }
  }

  // Compute window: last 30 minutes
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 30 * 60 * 1000);
  const since = Math.floor(windowStart.getTime() / 1000);

  const errors: string[] = [];
  let snapshots = 0;

  try {
    for (const stable of STABLES) {
      for (const chain of CHAINS) {
        try {
          const transfers = await getRecentStablecoinTransfers({
            chain,
            stableSymbol: stable,
            sinceTimestamp: since,
            minUsd: 10_000,
          });

          if (!transfers.length) continue;

          // Approximate net inflow for this chain: sum of incoming minus outgoing.
          // For now, treat "to" as inflow, "from" as outflow.
          // More advanced bridge detection can be added later.
          let netUsd = 0;
          for (const t of transfers) {
            // if this chain is the recipient, assume inflow
            // (we're already filtered by chain, so each transfer is on this chain)
            netUsd += t.amountUsd; // naive: we only care that big transfers happened on this chain
          }

          if (Math.abs(netUsd) < 50_000) {
            // ignore tiny net-flow
            continue;
          }

          await withDbRetry(() =>
            prisma.stablecoinFlowSnapshot.create({
              data: {
                stableSymbol: stable,
                fromChain: 'mixed', // placeholder - we only track TO for now
                toChain: chain,
                netAmountUsd: netUsd,
                windowStart,
                windowEnd,
              },
            })
          );

          snapshots += 1;
        } catch (err: any) {
          console.error('[StablecoinFlows] Error for', stable, chain, err);
          errors.push(`${stable}:${chain}:${err?.message || 'Unknown error'}`);
        }
      }
    }

    // After saving snapshots, derive high-level LiquiditySignal entries
    await generateLiquiditySignals(windowStart, windowEnd);

    return res.status(200).json({
      ok: true,
      snapshots,
      errors: errors.length ? errors : undefined,
    });
  } catch (err: any) {
    console.error('[StablecoinFlows] Fatal error', err);
    return res.status(500).json({
      ok: false,
      snapshots: 0,
      errors: [err?.message || 'Fatal error'],
    });
  }
}

