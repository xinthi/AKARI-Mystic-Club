/**
 * Admin Resolve Prediction API
 * 
 * POST: Resolve a prediction and pay out winners
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../../lib/prisma';
import { MYST_CONFIG } from '../../../../../lib/myst-service';

interface ResolveResponse {
  ok: boolean;
  winnersCount?: number;
  totalPayout?: number;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResolveResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, message: 'Invalid prediction ID' });
  }

  // Verify admin token
  const adminToken = req.headers['x-admin-token'];
  if (adminToken !== process.env.ADMIN_PANEL_TOKEN) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  const { winningOption } = req.body;
  if (typeof winningOption !== 'number') {
    return res.status(400).json({ ok: false, message: 'winningOption is required' });
  }

  try {
    // Get prediction with all bets
    const prediction = await prisma.prediction.findUnique({
      where: { id },
      include: {
        bets: true,
      },
    });

    if (!prediction) {
      return res.status(404).json({ ok: false, message: 'Prediction not found' });
    }

    if (prediction.status === 'RESOLVED') {
      return res.status(400).json({ ok: false, message: 'Prediction already resolved' });
    }

    if (winningOption < 0 || winningOption >= prediction.options.length) {
      return res.status(400).json({ ok: false, message: 'Invalid winning option index' });
    }

    // Calculate pool and payouts
    const totalPool = prediction.bets.reduce((sum, bet) => sum + (bet.mystBet ?? 0), 0);
    const winningBets = prediction.bets.filter(bet => bet.option === prediction.options[winningOption]);
    const winningPool = winningBets.reduce((sum, bet) => sum + (bet.mystBet ?? 0), 0);

    // Platform fee (already taken during betting, but we calculate for reference)
    const platformFee = totalPool * MYST_CONFIG.DEFAULT_FEE_RATE;
    const payoutPool = totalPool - platformFee;

    // Process payouts in a transaction
    const result = await prisma.$transaction(async (tx) => {
      let winnersCount = 0;
      let totalPayout = 0;

      // Pay out winners proportionally
      if (winningPool > 0 && winningBets.length > 0) {
        for (const bet of winningBets) {
          const betAmount = bet.mystBet ?? 0;
          if (betAmount > 0) {
            // Calculate proportional payout
            const share = betAmount / winningPool;
            const payout = payoutPool * share;

            // Credit user
            await tx.mystTransaction.create({
              data: {
                userId: bet.userId,
                type: 'prediction_win',
                amount: payout,
                meta: {
                  predictionId: prediction.id,
                  betId: bet.id,
                  betAmount,
                  share,
                },
              },
            });

            winnersCount++;
            totalPayout += payout;
          }
        }
      }

      // If no winners, return funds (minus platform fee) to all bettors
      if (winningBets.length === 0 && prediction.bets.length > 0) {
        for (const bet of prediction.bets) {
          const betAmount = bet.mystBet ?? 0;
          if (betAmount > 0) {
            // Return original bet minus platform fee that was already taken
            const refundAmount = betAmount * (1 - MYST_CONFIG.DEFAULT_FEE_RATE);
            
            await tx.mystTransaction.create({
              data: {
                userId: bet.userId,
                type: 'prediction_refund',
                amount: refundAmount,
                meta: {
                  predictionId: prediction.id,
                  betId: bet.id,
                  reason: 'no_winners',
                },
              },
            });
          }
        }
      }

      // Update prediction status
      await tx.prediction.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolved: true,
          winningOption: prediction.options[winningOption], // Store the actual option string
          resolvedAt: new Date(),
        },
      });

      return { winnersCount, totalPayout };
    });

    console.log(`[AdminPrediction] Resolved ${id}: Option ${winningOption} (${prediction.options[winningOption]}), ${result.winnersCount} winners, ${result.totalPayout.toFixed(2)} MYST paid out`);

    return res.status(200).json({
      ok: true,
      winnersCount: result.winnersCount,
      totalPayout: result.totalPayout,
      message: `Prediction resolved. ${result.winnersCount} winner(s) received ${result.totalPayout.toFixed(2)} MYST.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AdminPrediction] Resolve failed:', message);
    return res.status(500).json({ ok: false, message: 'Failed to resolve prediction' });
  }
}

