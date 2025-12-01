/**
 * Place Bet API
 *
 * POST: Place a bet on a prediction
 * Supports both legacy (points) and new (MYST) betting.
 * 
 * ECONOMIC MODEL:
 * - The ENTIRE bet amount goes into the prediction pool
 * - NO tax or fee is applied at bet time
 * - Fees are only applied when the prediction is RESOLVED (10% of losing side)
 * - From platform fee: 10% goes to referral leaderboard (weekly distribution)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { getUserFromRequest } from '../../../../lib/telegram-auth';
import { getMystBalance, creditMyst, MYST_CONFIG } from '../../../../lib/myst-service';

interface BetResponse {
  ok: boolean;
  betId?: string;
  bet?: {
    id: string;
    option: string;
    starsBet: number;
    pointsBet: number;
    mystBet: number;
    createdAt: Date;
  };
  newPot?: number;
  newPoints?: number;
  newMystBalance?: number;
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
    const { optionIndex, option: optionString, betAmount, mystAmount } = body;

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
    let optionIdx = 0;

    if (!Number.isNaN(index)) {
      // Validate index is in range
      if (index < 0 || index >= safeOptions.length) {
        res.status(400).json({ ok: false, reason: 'Option index out of range' });
        return;
      }
      resolvedOption = safeOptions[index] as string;
      optionIdx = index;
    } else if (typeof optionString === 'string' && optionString.length > 0) {
      // Validate option string exists in options
      const foundIdx = safeOptions.indexOf(optionString);
      if (foundIdx === -1) {
        res.status(400).json({ ok: false, reason: 'Invalid option' });
        return;
      }
      resolvedOption = optionString;
      optionIdx = foundIdx;
    } else {
      res.status(400).json({ ok: false, reason: 'Invalid option index' });
      return;
    }

    // Check if prediction is still active
    if (prediction.resolved) {
      res.status(400).json({ ok: false, reason: 'Prediction is already resolved' });
      return;
    }

    if (prediction.endsAt && new Date(prediction.endsAt) < new Date()) {
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

    // Determine bet type (MYST, stars, or points)
    let starsBet = 0;
    let pointsBet = 0;
    let mystBet = 0;

    // Check if using MYST
    if (mystAmount && typeof mystAmount === 'number' && mystAmount > 0) {
      // MYST betting
      mystBet = mystAmount;

      // Enforce global minimum bet (2 MYST)
      if (mystBet < MYST_CONFIG.MINIMUM_BET) {
        res.status(400).json({ ok: false, reason: `Minimum bet is ${MYST_CONFIG.MINIMUM_BET} MYST` });
        return;
      }

      // Check prediction-specific minimum entry fee (if higher than global)
      if (prediction.entryFeeMyst > 0 && mystBet < prediction.entryFeeMyst) {
        res.status(400).json({ ok: false, reason: `Minimum bet is ${prediction.entryFeeMyst} MYST` });
        return;
      }

      // Check MYST balance
      const mystBalance = await getMystBalance(prisma, user.id);
      if (mystBalance < mystBet) {
        res.status(400).json({ ok: false, reason: `Insufficient MYST. Have: ${mystBalance}, Need: ${mystBet}` });
        return;
      }

      // ECONOMIC MODEL: Debit FULL bet amount - NO SPLITS AT BET TIME
      // The entire bet goes into the pool. Fees are taken only on resolution.
      await prisma.mystTransaction.create({
        data: {
          userId: user.id,
          type: 'spend_bet',
          amount: -mystBet,
          meta: { predictionId: id, option: resolvedOption },
        },
      });

    } else if (prediction.entryFeeStars > 0) {
      // Legacy Stars betting
      starsBet = typeof betAmount === 'number' ? betAmount : prediction.entryFeeStars;

      if (starsBet < prediction.entryFeeStars) {
        res.status(400).json({ ok: false, reason: `Minimum bet is ${prediction.entryFeeStars} Stars` });
        return;
      }
    } else {
      // Legacy Points betting
      pointsBet = typeof betAmount === 'number' ? betAmount : prediction.entryFeePoints;

      if (prediction.entryFeePoints > 0 && pointsBet < prediction.entryFeePoints) {
        res.status(400).json({ ok: false, reason: `Minimum bet is ${prediction.entryFeePoints} points` });
        return;
      }

      // Check user has enough points
      if (pointsBet > 0 && user.points < pointsBet) {
        res.status(400).json({ ok: false, reason: 'Insufficient points' });
        return;
      }
    }

    // Determine which pool to update (Yes = index 0, No = index 1)
    const isYes = optionIdx === 0;

    // Create bet, update prediction pools, and deduct user points
    const totalBetAmount = starsBet + pointsBet;

    const [bet, updatedPrediction, updatedUser] = await prisma.$transaction([
      prisma.bet.create({
        data: {
          userId: user.id,
          predictionId: id,
          option: resolvedOption,
          starsBet,
          pointsBet,
          mystBet,
        },
      }),
      prisma.prediction.update({
        where: { id },
        data: {
          pot: { increment: totalBetAmount },
          participantCount: { increment: 1 },
          // Update MYST pools - FULL BET AMOUNT goes to pool
          ...(mystBet > 0 && isYes ? { mystPoolYes: { increment: mystBet } } : {}),
          ...(mystBet > 0 && !isYes ? { mystPoolNo: { increment: mystBet } } : {}),
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

    // Get new MYST balance if MYST was used
    let newMystBalance: number | undefined;
    if (mystBet > 0) {
      newMystBalance = await getMystBalance(prisma, user.id);
    }

    res.status(200).json({
      ok: true,
      betId: bet.id,
      bet: {
        id: bet.id,
        option: bet.option,
        starsBet: bet.starsBet,
        pointsBet: bet.pointsBet,
        mystBet: bet.mystBet,
        createdAt: bet.createdAt,
      },
      newPot: updatedPrediction.pot,
      newPoints: updatedUser?.points ?? user.points,
      newMystBalance,
    });
  } catch (err: any) {
    console.error('Bet API error:', err);
    res.status(500).json({ ok: false, reason: err.message || 'Failed to place bet' });
  }
}
