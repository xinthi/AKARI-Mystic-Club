/**
 * Resolve Prediction API
 *
 * POST: Resolve a prediction (admin only)
 * Distributes pot to winners using proper pool math.
 * 
 * Pool Math:
 * - POOL = Y + N (total MYST on both sides)
 * - FEE = POOL * feeRate (platform fee)
 * - WIN_POOL = POOL - FEE
 * - payout_per_MYST = WIN_POOL / winning_side_total
 * - user_payout = user_stake * payout_per_MYST
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { getTelegramUserFromRequest } from '../../../../lib/telegram-auth';
import { calculatePredictionPayout, creditWinningPayout } from '../../../../lib/myst-service';
import { z } from 'zod';

const resolvePredictionSchema = z.object({
  winningOption: z.string(), // The winning option string (e.g., "Yes" or "No")
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const telegramUser = getTelegramUserFromRequest(req);

    if (!telegramUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is admin
    const adminId = process.env.ADMIN_TELEGRAM_ID;
    if (!adminId || telegramUser.id.toString() !== adminId) {
      return res.status(403).json({ error: 'Forbidden - Admin only' });
    }

    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Prediction ID is required' });
    }

    const validation = resolvePredictionSchema.safeParse(req.body);

    if (!validation.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request data', details: validation.error.errors });
    }

    // Get prediction
    const prediction = await prisma.prediction.findUnique({
      where: { id },
      include: {
        bets: true,
      },
    });

    if (!prediction) {
      return res.status(404).json({ error: 'Prediction not found' });
    }

    if (prediction.resolved) {
      return res.status(400).json({ error: 'Prediction is already resolved' });
    }

    // Check winner option is valid
    if (!prediction.options.includes(validation.data.winningOption)) {
      return res.status(400).json({ error: 'Invalid winning option' });
    }

    // Determine winning side (Yes = index 0, No = index 1)
    const winningOptionIndex = prediction.options.indexOf(validation.data.winningOption);
    const isYesWinner = winningOptionIndex === 0;

    // Get winning and losing pools
    const winningSideTotal = isYesWinner ? prediction.mystPoolYes : prediction.mystPoolNo;
    const losingSideTotal = isYesWinner ? prediction.mystPoolNo : prediction.mystPoolYes;

    // Get winning bets
    const winningBets = prediction.bets.filter(
      (bet) => bet.option === validation.data.winningOption
    );

    // Calculate fee rate
    const feeRate = prediction.feeRate || 0.08;

    // Calculate total pools and fee for reporting
    const totalPool = winningSideTotal + losingSideTotal;
    const fee = totalPool * feeRate;
    const winPool = totalPool - fee;

    // Legacy payout calculation for points-based bets
    const houseFee = Math.floor(prediction.pot * 0.05);
    const legacyPayoutPot = prediction.pot - houseFee;

    const totalLegacyWinningBets = winningBets.reduce(
      (sum, bet) => sum + (bet.starsBet || bet.pointsBet),
      0
    );

    // Resolve prediction and distribute winnings
    await prisma.$transaction(async (tx) => {
      // Mark prediction as resolved
      await tx.prediction.update({
        where: { id },
        data: {
          resolved: true,
          winningOption: validation.data.winningOption,
        },
      });

      // Process MYST payouts
      if (winningBets.length > 0 && winningSideTotal > 0) {
        for (const bet of winningBets) {
          // MYST payout
          if (bet.mystBet > 0) {
            const { payout } = calculatePredictionPayout(
              bet.mystBet,
              winningSideTotal,
              losingSideTotal,
              feeRate
            );

            if (payout > 0) {
              // Credit MYST payout via transaction
              await creditWinningPayout(prisma, bet.userId, payout, prediction.id);

              // Update bet with payout amount
              await tx.bet.update({
                where: { id: bet.id },
                data: { mystPayout: payout },
              });
            }
          }

          // Legacy points payout
          if ((bet.starsBet > 0 || bet.pointsBet > 0) && totalLegacyWinningBets > 0) {
            const betAmount = bet.starsBet || bet.pointsBet;
            const share = (betAmount / totalLegacyWinningBets) * legacyPayoutPot;
            const payout = Math.floor(share);

            if (payout > 0) {
              await tx.user.update({
                where: { id: bet.userId },
                data: {
                  points: {
                    increment: payout,
                  },
                },
              });
            }
          }
        }
      }
    });

    console.log(
      `[Resolve] Prediction ${id} resolved. Winner: ${validation.data.winningOption}. ` +
      `MYST Pool: ${totalPool}, Fee: ${fee}, Winners: ${winningBets.length}`
    );

    return res.status(200).json({
      success: true,
      message: `Prediction resolved. Winner: ${validation.data.winningOption}`,
      mystPool: {
        yes: prediction.mystPoolYes,
        no: prediction.mystPoolNo,
        total: totalPool,
        fee,
        winPool,
      },
      legacyPayoutPot,
      winners: winningBets.length,
    });
  } catch (error: any) {
    console.error('Resolve prediction API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message }),
    });
  }
}
