/**
 * Admin Resolve Prediction API
 * 
 * POST: Resolve a prediction and pay out winners
 * 
 * ECONOMIC MODEL:
 * - Fees are already taken at bet time (15% leaderboard, 10% referral, 5% wheel, 70% treasury)
 * - Prediction pool contains 70% of all bets (treasury portion)
 * - Winners receive: 100% of the pool, distributed proportionally
 * - No additional fees on resolution
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../../lib/prisma';

interface ResolveResponse {
  ok: boolean;
  winnersCount?: number;
  totalPayout?: number;
  economicModel?: {
    totalPool: number;
    winningSide: string;
    losingSide: string;
    winPool: number;
    note: string;
  };
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

    const winningOptionString = prediction.options[winningOption];
    const isYesWinner = winningOption === 0;

    // Get pool totals
    const winningSideTotal = isYesWinner ? prediction.mystPoolYes : prediction.mystPoolNo;
    const losingSideTotal = isYesWinner ? prediction.mystPoolNo : prediction.mystPoolYes;
    const totalPool = winningSideTotal + losingSideTotal;

    // ECONOMIC MODEL: Fees already taken at bet time
    // Pool contains 70% of all bets (treasury portion)
    // Winners get 100% of the pool, distributed proportionally
    const winPool = totalPool;

    // Get winning bets
    const winningBets = prediction.bets.filter(bet => bet.option === winningOptionString);

    // Process payouts in a transaction
    const result = await prisma.$transaction(async (tx) => {
      let winnersCount = 0;
      let totalPayout = 0;

      // Pay out winners proportionally
      if (winningSideTotal > 0 && winningBets.length > 0) {
        for (const bet of winningBets) {
          const betAmount = bet.mystBet ?? 0;
          if (betAmount > 0) {
            // Calculate payout: user_stake * (win_pool / winning_side_total)
            const payoutPerMyst = winPool / winningSideTotal;
            const payout = betAmount * payoutPerMyst;

            // Credit user
            await tx.mystTransaction.create({
              data: {
                userId: bet.userId,
                type: 'prediction_win',
                amount: payout,
                meta: {
                  predictionId: prediction.id,
                  betId: bet.id,
                  userStake: betAmount,
                  payoutPerMyst,
                  winPool,
                  winningSideTotal,
                },
              },
            });

            // Update bet with payout
            await tx.bet.update({
              where: { id: bet.id },
              data: { mystPayout: payout },
            });

            winnersCount++;
            totalPayout += payout;
          }
        }
      }

      // If no winners, refund bets proportionally (minus platform fee)
      if (winningBets.length === 0 && prediction.bets.length > 0) {
        for (const bet of prediction.bets) {
          const betAmount = bet.mystBet ?? 0;
          if (betAmount > 0) {
            // Each bettor gets their share of winPool
            const refundAmount = betAmount * (winPool / totalPool);
            
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

      // Fees already distributed at bet time via spendMyst
      // No additional pool updates needed on resolution

      // Update prediction status
      await tx.prediction.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolved: true,
          winningOption: winningOptionString,
          resolvedAt: new Date(),
        },
      });

      return { winnersCount, totalPayout };
    });

    console.log(
      `[AdminPrediction] Resolved ${id}: Option ${winningOption} (${winningOptionString}). ` +
      `Pool: YES=${prediction.mystPoolYes}, NO=${prediction.mystPoolNo}, Total=${totalPool}. ` +
      `${result.winnersCount} winners, ${result.totalPayout.toFixed(2)} MYST paid out (fees already taken at bet time)`
    );

    return res.status(200).json({
      ok: true,
      winnersCount: result.winnersCount,
      totalPayout: result.totalPayout,
      economicModel: {
        totalPool,
        winningSide: isYesWinner ? 'YES' : 'NO',
        losingSide: isYesWinner ? 'NO' : 'YES',
        winPool,
        note: 'Fees (15% leaderboard, 10% referral, 5% wheel, 70% treasury) already taken at bet time',
      },
      message: `Prediction resolved. ${result.winnersCount} winner(s) received ${result.totalPayout.toFixed(2)} MYST.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AdminPrediction] Resolve failed:', message);
    return res.status(500).json({ ok: false, message: 'Failed to resolve prediction' });
  }
}
