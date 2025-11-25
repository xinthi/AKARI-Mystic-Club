/**
 * Place Bet API
 *
 * POST: Place a bet on a prediction
 * Authenticate via Telegram initData header
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { prisma } from '../../../../lib/prisma';

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

/**
 * Verify Telegram initData and return parsed user
 */
function verifyAndParseInitData(initData: string, botToken: string): { id: string } | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');
    const dataCheckArr: string[] = [];
    Array.from(params.keys())
      .sort()
      .forEach((key) => {
        const value = params.get(key);
        if (value !== null) {
          dataCheckArr.push(`${key}=${value}`);
        }
      });

    const dataCheckString = dataCheckArr.join('\n');
    const secret = crypto.createHash('sha256').update(botToken).digest();
    const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

    if (hmac !== hash) return null;

    const userJson = params.get('user');
    if (!userJson) return null;

    const parsed = JSON.parse(userJson);
    return { id: String(parsed.id) };
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<BetResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'Method not allowed' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ ok: false, reason: 'Server misconfigured' });
  }

  // Authenticate via initData header
  const initData = (req.headers['x-telegram-init-data'] as string) || '';
  const telegramUser = verifyAndParseInitData(initData, botToken);

  if (!telegramUser) {
    return res.status(401).json({ ok: false, reason: 'Unauthorized' });
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
    // Find user by telegramId
    const user = await prisma.user.findUnique({
      where: { telegramId: telegramUser.id },
    });

    if (!user) {
      return res.status(404).json({ ok: false, reason: 'User not found' });
    }

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
