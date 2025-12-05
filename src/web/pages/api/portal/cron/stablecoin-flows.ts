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

// TODO: Add solana and base support once Uniblock API supports them for stablecoins
const CHAINS = ['ethereum'] as const;
type Chain = (typeof CHAINS)[number];

const STABLES: ('USDT' | 'USDC')[] = ['USDT', 'USDC'];

type Response = {
  ok: boolean;
  snapshots: number;
  errors?: string[];
};

async function generateLiquiditySignals(windowStart: Date, windowEnd: Date): Promise<void> {
  try {
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

    // TODO: Enable solana/base signals once we support those chains
    // const usdtSol = sum('USDT', 'solana');
    // const usdcBase = sum('USDC', 'base');
    const usdtEth = sum('USDT', 'ethereum');

    const signals: {
      type: string;
      title: string;
      description: string;
      severity: number;
      chain: string;
      stableSymbol: string;
    }[] = [];

    // NOTE: thresholds temporarily lowered for testing; raise again in production
    // TODO: Re-enable when solana/base support is added
    // if (usdtSol > 20_000) {
    //   signals.push({
    //     type: 'SOL_MEME_SEASON',
    //     title: 'Massive USDT inflow to Solana',
    //     description: 'Stablecoin liquidity is rotating into Solana. Meme season signal triggered.',
    //     severity: usdtSol > 100_000 ? 3 : 2,
    //     chain: 'solana',
    //     stableSymbol: 'USDT',
    //   });
    // }

    // if (usdcBase > 20_000) {
    //   signals.push({
    //     type: 'BASE_SOCIALFI',
    //     title: 'USDC inflow to Base',
    //     description: 'Fresh USDC capital is entering Base. SocialFi / degen app rotation likely.',
    //     severity: usdcBase > 100_000 ? 3 : 2,
    //     chain: 'base',
    //     stableSymbol: 'USDC',
    //   });
    // }

    // NOTE: threshold temporarily lowered for testing; raise to -400_000 in production
    if (usdtEth < -20_000) {
      signals.push({
        type: 'ETH_RISK_OFF',
        title: 'USDT outflow from Ethereum',
        description: 'Net USDT is leaving Ethereum. Risk-off / rotation into alt L1s possible.',
        severity: usdtEth < -100_000 ? 3 : 2, // NOTE: severity threshold also lowered for testing
        chain: 'ethereum',
        stableSymbol: 'USDT',
      });
    }

    for (const s of signals) {
      await withDbRetry(() =>
        prisma.liquiditySignal.create({
          data: {
            type: s.type,
            title: s.title,
            description: s.description,
            severity: s.severity,
            chain: s.chain,
            stableSymbol: s.stableSymbol,
            triggeredAt: now,
          },
        })
      );
    }
  } catch (error: any) {
    console.error('[StablecoinFlows] Error in generateLiquiditySignals:', error);
    // Don't throw - let the handler continue and return success even if signal generation fails
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
    console.log('[StablecoinFlows] Starting cron at', new Date().toISOString());
    console.log('[StablecoinFlows] Window:', windowStart.toISOString(), 'to', windowEnd.toISOString());

    for (const stable of STABLES) {
      for (const chain of CHAINS) {
        try {
          console.log(`[StablecoinFlows] Fetching ${stable} transfers for ${chain}`);
          
          const transfers = await getRecentStablecoinTransfers({
            chain,
            stableSymbol: stable,
            sinceTimestamp: since,
            minUsd: 100, // NOTE: temporarily lowered for testing; raise to 10_000 in production
          });

          console.log(`[StablecoinFlows] Found ${transfers.length} ${stable} transfers on ${chain}`);

          if (!transfers.length) {
            continue;
          }

          // Approximate net inflow for this chain: sum of incoming minus outgoing.
          // For now, treat "to" as inflow, "from" as outflow.
          // More advanced bridge detection can be added later.
          let netUsd = 0;
          for (const t of transfers) {
            // if this chain is the recipient, assume inflow
            // (we're already filtered by chain, so each transfer is on this chain)
            netUsd += t.amountUsd; // naive: we only care that big transfers happened on this chain
          }

          if (Math.abs(netUsd) < 1_000) {
            // ignore tiny net-flow
            // NOTE: threshold temporarily lowered for testing; raise to 50_000 in production
            console.log(`[StablecoinFlows] Net flow ${netUsd} too small for ${stable}:${chain}, skipping`);
            continue;
          }

          console.log(`[StablecoinFlows] Creating snapshot for ${stable}:${chain} with netUsd=${netUsd}`);

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
          console.log(`[StablecoinFlows] ✅ Created snapshot for ${stable}:${chain}`);
        } catch (err: any) {
          console.error(`[StablecoinFlows] Error for ${stable}:${chain}:`, err);
          const errorMsg = err?.message || 'Unknown error';
          errors.push(`${stable}:${chain}:${errorMsg}`);
          // Continue to next chain/stable combination
        }
      }
    }

    // After saving snapshots, derive high-level LiquiditySignal entries
    // Wrap in try/catch so signal generation errors don't fail the entire cron
    try {
      await generateLiquiditySignals(windowStart, windowEnd);
    } catch (signalErr: any) {
      console.error('[StablecoinFlows] Error generating liquidity signals:', signalErr);
      errors.push(`signal_generation:${signalErr?.message || 'Unknown error'}`);
    }

    console.log(`[StablecoinFlows] Completed: snapshots=${snapshots}, errors=${errors.length}`);

    return res.status(200).json({
      ok: true,
      snapshots,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error('[StablecoinFlows] Fatal error:', err);
    console.error('[StablecoinFlows] Error stack:', err?.stack);
    return res.status(500).json({
      ok: false,
      snapshots: 0,
      errors: [err?.message || 'Internal error'],
    });
  }
}

