/**
 * Resolve Prediction API
 *
 * POST: Resolve a prediction (admin only)
 * Distributes pot to winners
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { getTelegramUserFromRequest } from '../../../../lib/telegram-auth';
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

    // Get winning bets
    const winningBets = prediction.bets.filter(
      (bet) => bet.option === validation.data.winningOption
    );

    // Calculate payout (95% of pot, 5% house fee)
    const houseFeeRate = 0.05;
    const houseFee = Math.floor(prediction.pot * houseFeeRate);
    const payoutPot = prediction.pot - houseFee;

    // Calculate total bet amount for winners
    const totalWinningBets = winningBets.reduce(
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

      // Distribute winnings proportionally (only if there are winners)
      if (winningBets.length > 0 && totalWinningBets > 0) {
        for (const bet of winningBets) {
          const betAmount = bet.starsBet || bet.pointsBet;
          const share = (betAmount / totalWinningBets) * payoutPot;
          const payout = Math.floor(share);

          // Payout in points
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
    });

    return res.status(200).json({
      success: true,
      message: `Prediction resolved. Winner: ${validation.data.winningOption}`,
      payoutPot,
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
