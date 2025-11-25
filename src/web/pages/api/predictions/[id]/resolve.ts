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
  winnerOption: z.number().int().min(0),
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
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validation.error.errors
      });
    }

    // Get prediction
    const prediction = await prisma.prediction.findUnique({
      where: { id },
      include: {
        bets: true
      }
    });

    if (!prediction) {
      return res.status(404).json({ error: 'Prediction not found' });
    }

    if (prediction.resolved) {
      return res.status(400).json({ error: 'Prediction is already resolved' });
    }

    // Check winner option is valid
    if (validation.data.winnerOption >= prediction.options.length) {
      return res.status(400).json({ error: 'Invalid winner option' });
    }

    // Get winning bets
    const winningBets = prediction.bets.filter(
      bet => bet.optionIndex === validation.data.winnerOption
    );

    if (winningBets.length === 0) {
      return res.status(400).json({ error: 'No bets on winning option' });
    }

    // Calculate payout (95% of pot, 5% house fee)
    const houseFee = prediction.pot * prediction.houseFee;
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
          winnerOption: validation.data.winnerOption
        }
      });

      // Distribute winnings proportionally
      for (const bet of winningBets) {
        const betAmount = bet.starsBet || bet.pointsBet;
        const share = (betAmount / totalWinningBets) * payoutPot;
        const payout = Math.floor(share);

        if (bet.starsBet > 0) {
          // Stars payout (would need external payment system)
          // For now, convert to points at 1:1 ratio
          await tx.user.update({
            where: { id: bet.userId },
            data: {
              points: {
                increment: payout
              }
            }
          });
        } else {
          // Points payout
          await tx.user.update({
            where: { id: bet.userId },
            data: {
              points: {
                increment: payout
              }
            }
          });
        }
      }
    });

    return res.status(200).json({
      success: true,
      message: `Prediction resolved. Winner: Option ${validation.data.winnerOption + 1}`,
      payoutPot,
      winners: winningBets.length
    });
  } catch (error: any) {
    console.error('Resolve prediction API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
}

