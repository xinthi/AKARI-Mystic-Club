/**
 * Prediction Detail API
 * 
 * GET: Get prediction details
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Prediction ID is required' });
    }

    // Try to read initData, but never crash the request
    const initDataHeader =
      (req.headers['x-telegram-init-data'] as string | undefined) ||
      (typeof req.body === 'string'
        ? req.body
        : (req.body?.initData as string | undefined));

    let userId: string | number | null = null;

    if (initDataHeader) {
      try {
        const params = new URLSearchParams(initDataHeader);
        const userJson = params.get('user');
        if (userJson) {
          const parsed = JSON.parse(userJson);
          userId = parsed.id;
        } else {
          console.warn('No user in initData for GET /api/predictions/[id]');
        }
      } catch (err) {
        console.error('Failed to parse Telegram initData for GET /api/predictions/[id]:', err);
      }
    } else {
      console.warn('No X-Telegram-Init-Data header for GET /api/predictions/[id]');
    }

    const telegramId = userId ? BigInt(userId) : null;

    const prediction = await prisma.prediction.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            tier: true
          }
        },
        bets: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                tier: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: { bets: true }
        }
      }
    });

    if (!prediction) {
      return res.status(404).json({ error: 'Prediction not found' });
    }

    // Check if user has placed a bet
    let userBet = null;
    if (telegramId) {
      const user = await prisma.user.findUnique({
        where: { telegramId }
      });
      
      if (user) {
        const bet = await prisma.bet.findUnique({
          where: {
            userId_predictionId: {
              userId: user.id,
              predictionId: id
            }
          }
        });
        
        if (bet) {
          userBet = {
            optionIndex: bet.optionIndex,
            starsBet: bet.starsBet,
            pointsBet: bet.pointsBet,
            createdAt: bet.createdAt
          };
        }
      }
    }

    // Calculate option statistics
    const optionStats = prediction.options.map((_, index) => {
      const betsForOption = prediction.bets.filter(b => b.optionIndex === index);
      const totalStars = betsForOption.reduce((sum, b) => sum + b.starsBet, 0);
      const totalPoints = betsForOption.reduce((sum, b) => sum + b.pointsBet, 0);
      
      return {
        option: prediction.options[index],
        index,
        betCount: betsForOption.length,
        totalStars,
        totalPoints
      };
    });

    return res.status(200).json({
      prediction: {
        id: prediction.id,
        title: prediction.title,
        description: prediction.description,
        options: prediction.options,
        entryFeeStars: prediction.entryFeeStars,
        entryFeePoints: prediction.entryFeePoints,
        pot: prediction.pot,
        houseFee: prediction.houseFee,
        resolved: prediction.resolved,
        winnerOption: prediction.winnerOption,
        endsAt: prediction.endsAt,
        createdAt: prediction.createdAt,
        creator: prediction.creator,
        participantCount: prediction._count.bets,
        optionStats,
        userBet
      }
    });
  } catch (error: any) {
    console.error('Prediction detail API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
}

