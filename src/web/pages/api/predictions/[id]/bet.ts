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
  betId?: string;
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
  // Reject non-POST methods
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, reason: 'Method not allowed' });
    return;
  }

  try {
    // Get authenticated user via Telegram initData
    const user = await getUserFromRequest(req, prisma);
    if (!user) {
      res.status(401).json({ ok: false, reason: 'Not authenticated via Telegram' });
      return;
    }

    // Validate prediction ID
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      res.status(400).json({ ok: false, reason: 'Prediction ID is required' });
      return;
    }

    // Parse and validate optionIndex from body
    const body = req.body ?? {};
    const { optionIndex, option: optionString, betAmount } = body;

    // Support both optionIndex (number) and option (string)
    let index: number = NaN;

    if (optionIndex !== undefined) {
      // Parse optionIndex - can be number or string
      index =
        typeof optionIndex === 'number'
          ? optionIndex
          : typeof optionIndex === 'string'
          ? parseInt(optionIndex, 10)
          : NaN;
    }

    // Load prediction
    const prediction = await prisma.prediction.findUnique({
      where: { id },
    });

    if (!prediction) {
      res.status(404).json({ ok: false, reason: 'Prediction not found' });
      return;
    }

    // Ensure options is a valid array
    const safeOptions = Array.isArray(prediction.options) ? prediction.options : [];

    // Resolve the option - either by index or by string
    let resolvedOption: string | null = null;

    if (!Number.isNaN(index)) {
      // Validate index is in range
      if (index < 0 || index >= safeOptions.length) {
        res.status(400).json({ ok: false, reason: 'Option index out of range' });
        return;
      }
      resolvedOption = safeOptions[index] as string;
    } else if (typeof optionString === 'string' && optionString.length > 0) {
      // Validate option string exists in options
      if (!safeOptions.includes(optionString)) {
        res.status(400).json({ ok: false, reason: 'Invalid option' });
        return;
      }
      resolvedOption = optionString;
    } else {
      res.status(400).json({ ok: false, reason: 'Invalid option index' });
      return;
    }

    // Check if prediction is still active
    if (prediction.resolved) {
      res.status(400).json({ ok: false, reason: 'Prediction is already resolved' });
      return;
    }

    if (new Date(prediction.endsAt) < new Date()) {
      res.status(400).json({ ok: false, reason: 'Prediction has ended' });
      return;
    }

    // Check if user already placed a bet
    const existingBet = await prisma.bet.findFirst({
      where: {
        userId: user.id,
        predictionId: id,
      },
    });

    if (existingBet) {
      res.status(400).json({ ok: false, reason: 'You have already placed a bet on this prediction' });
      return;
    }

    // Determine bet type (stars or points)
    let starsBet = 0;
    let pointsBet = 0;

    if (prediction.entryFeeStars > 0) {
      starsBet = typeof betAmount === 'number' ? betAmount : prediction.entryFeeStars;
    } else {
      pointsBet = typeof betAmount === 'number' ? betAmount : prediction.entryFeePoints;
    }

    // Check minimum entry fee
    if (prediction.entryFeeStars > 0 && starsBet < prediction.entryFeeStars) {
      res.status(400).json({ ok: false, reason: `Minimum bet is ${prediction.entryFeeStars} Stars` });
      return;
    }

    if (prediction.entryFeePoints > 0 && pointsBet < prediction.entryFeePoints) {
      res.status(400).json({ ok: false, reason: `Minimum bet is ${prediction.entryFeePoints} points` });
      return;
    }

    // Check user has enough points
    if (pointsBet > 0 && user.points < pointsBet) {
      res.status(400).json({ ok: false, reason: 'Insufficient points' });
      return;
    }

    // Create bet, update prediction pot, and deduct user points
    const totalBetAmount = starsBet + pointsBet;

    const [bet, updatedPrediction, updatedUser] = await prisma.$transaction([
      prisma.bet.create({
        data: {
          userId: user.id,
          predictionId: id,
          option: resolvedOption,
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

    res.status(200).json({
      ok: true,
      betId: bet.id,
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
  } catch (err) {
    console.error('Bet API error:', err);
    res.status(500).json({ ok: false, reason: 'Failed to place bet' });
  }
}
