/**
 * Place Bet API
 *
 * POST: Place a bet on a prediction
 * Authenticate via Telegram initData header or admin fallback
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { getUserFromRequest } from '../../../../lib/telegram-auth';

interface BetResponse {
  ok: boolean;
  bet?: {
    id: string;
    option: string;
    starsBet: number;
    pointsBet: number;
    createdAt: Date;
  };
  newPot?: number;
  newPoints?: number;
  reason?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<BetResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'Method not allowed' });
  }

  // Get authenticated user
  const user = await getUserFromRequest(req, prisma);
  if (!user) {
    return res.status(401).json({ ok: false, reason: 'Not authenticated' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, reason: 'Prediction ID is required' });
  }

  const { option, betAmount } = req.body as { option?: string; betAmount?: number };

  if (!option) {
    return res.status(400).json({ ok: false, reason: 'Option is required' });
  }

  try {
    // Get prediction
    const prediction = await prisma.prediction.findUnique({
      where: { id },
    });

    if (!prediction) {
      return res.status(404).json({ ok: false, reason: 'Prediction not found' });
    }

    // Check if prediction is still active
    if (prediction.resolved) {
      return res.status(400).json({ ok: false, reason: 'Prediction is already resolved' });
    }

    if (new Date(prediction.endsAt) < new Date()) {
      return res.status(400).json({ ok: false, reason: 'Prediction has ended' });
    }

    // Check option is valid
    if (!prediction.options.includes(option)) {
      return res.status(400).json({ ok: false, reason: 'Invalid option' });
    }

    // Check if user already placed a bet
    const existingBet = await prisma.bet.findFirst({
      where: {
        userId: user.id,
        predictionId: id,
      },
    });

    if (existingBet) {
      return res.status(400).json({ ok: false, reason: 'You have already placed a bet on this prediction' });
    }

    // Determine bet type (stars or points)
    let starsBet = 0;
    let pointsBet = 0;

    if (prediction.entryFeeStars > 0) {
      starsBet = betAmount || prediction.entryFeeStars;
    } else {
      pointsBet = betAmount || prediction.entryFeePoints;
    }

    // Check minimum entry fee
    if (prediction.entryFeeStars > 0 && starsBet < prediction.entryFeeStars) {
      return res.status(400).json({ ok: false, reason: `Minimum bet is ${prediction.entryFeeStars} Stars` });
    }

    if (prediction.entryFeePoints > 0 && pointsBet < prediction.entryFeePoints) {
      return res.status(400).json({ ok: false, reason: `Minimum bet is ${prediction.entryFeePoints} points` });
    }

    // Check user has enough points
    if (pointsBet > 0 && user.points < pointsBet) {
      return res.status(400).json({ ok: false, reason: 'Insufficient points' });
    }

    // Create bet, update prediction pot, and deduct user points
    const totalBetAmount = starsBet + pointsBet;

    const [bet, updatedPrediction, updatedUser] = await prisma.$transaction([
      prisma.bet.create({
        data: {
          userId: user.id,
          predictionId: id,
          option,
          starsBet,
          pointsBet,
        },
      }),
      prisma.prediction.update({
        where: { id },
        data: {
          pot: { increment: totalBetAmount },
          participantCount: { increment: 1 },
        },
      }),
      pointsBet > 0
        ? prisma.user.update({
            where: { id: user.id },
            data: {
              points: { decrement: pointsBet },
            },
          })
        : prisma.user.findUnique({ where: { id: user.id } }),
    ]);

    return res.status(201).json({
      ok: true,
      bet: {
        id: bet.id,
        option: bet.option,
        starsBet: bet.starsBet,
        pointsBet: bet.pointsBet,
        createdAt: bet.createdAt,
      },
      newPot: updatedPrediction.pot,
      newPoints: updatedUser?.points ?? user.points,
    });
  } catch (error: any) {
    console.error('Place bet API error:', error);
    return res.status(500).json({ ok: false, reason: 'Server error' });
  }
}
