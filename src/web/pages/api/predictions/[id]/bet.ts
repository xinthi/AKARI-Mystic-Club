/**
 * Place Bet API
 * 
 * POST: Place a bet on a prediction
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { getTelegramUserFromRequest } from '../../../../lib/telegram-auth';
import { z } from 'zod';

const placeBetSchema = z.object({
  optionIndex: z.number().int().min(0),
  starsBet: z.number().int().min(0).default(0),
  pointsBet: z.number().int().min(0).default(0),
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

    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Prediction ID is required' });
    }

    const validation = placeBetSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validation.error.errors
      });
    }

    const telegramId = BigInt(telegramUser.id);
    const user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get prediction
    const prediction = await prisma.prediction.findUnique({
      where: { id }
    });

    if (!prediction) {
      return res.status(404).json({ error: 'Prediction not found' });
    }

    // Check if prediction is still active
    if (prediction.resolved) {
      return res.status(400).json({ error: 'Prediction is already resolved' });
    }

    if (new Date(prediction.endsAt) < new Date()) {
      return res.status(400).json({ error: 'Prediction has ended' });
    }

    // Check option index is valid
    if (validation.data.optionIndex >= prediction.options.length) {
      return res.status(400).json({ error: 'Invalid option index' });
    }

    // Check if user already placed a bet
    const existingBet = await prisma.bet.findUnique({
      where: {
        userId_predictionId: {
          userId: user.id,
          predictionId: id
        }
      }
    });

    if (existingBet) {
      return res.status(400).json({ error: 'You have already placed a bet on this prediction' });
    }

    // Check entry fee
    if (prediction.entryFeeStars > 0 && validation.data.starsBet < prediction.entryFeeStars) {
      return res.status(400).json({ error: `Minimum bet is ${prediction.entryFeeStars} Stars` });
    }

    if (prediction.entryFeePoints > 0 && validation.data.pointsBet < prediction.entryFeePoints) {
      return res.status(400).json({ error: `Minimum bet is ${prediction.entryFeePoints} points` });
    }

    // Check user has enough points
    if (validation.data.pointsBet > 0 && user.points < validation.data.pointsBet) {
      return res.status(400).json({ error: 'Insufficient points' });
    }

    // Place bet and update pot
    const betAmount = validation.data.starsBet || validation.data.pointsBet;
    
    const [bet, updatedPrediction, updatedUser] = await Promise.all([
      prisma.bet.create({
        data: {
          userId: user.id,
          predictionId: id,
          optionIndex: validation.data.optionIndex,
          starsBet: validation.data.starsBet,
          pointsBet: validation.data.pointsBet
        }
      }),
      prisma.prediction.update({
        where: { id },
        data: {
          pot: {
            increment: betAmount
          }
        }
      }),
      validation.data.pointsBet > 0
        ? prisma.user.update({
            where: { id: user.id },
            data: {
              points: {
                decrement: validation.data.pointsBet
              }
            }
          })
        : user
    ]);

    return res.status(201).json({
      bet: {
        id: bet.id,
        optionIndex: bet.optionIndex,
        starsBet: bet.starsBet,
        pointsBet: bet.pointsBet,
        createdAt: bet.createdAt
      },
      newPot: updatedPrediction.pot,
      newPoints: updatedUser.points
    });
  } catch (error: any) {
    console.error('Place bet API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
}

