/**
 * Predictions API
 * 
 * GET: List active predictions (with pagination)
 * POST: Create a new prediction (protected)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { z } from 'zod';

const createPredictionSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  options: z.array(z.string()).min(2).max(10),
  entryFeeStars: z.number().int().min(0).default(0),
  entryFeePoints: z.number().int().min(0).default(0),
  endsAt: z.string().datetime(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      // List active predictions
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;
      const resolved = req.query.resolved === 'true';

      const where: any = {
        resolved: resolved,
        endsAt: { gte: new Date() }
      };

      const [predictions, total] = await Promise.all([
        prisma.prediction.findMany({
          where,
          include: {
            creator: {
              select: {
                id: true,
                username: true,
                tier: true
              }
            },
            bets: {
              select: {
                userId: true,
                optionIndex: true,
                starsBet: true,
                pointsBet: true
              }
            },
            _count: {
              select: { bets: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.prediction.count({ where })
      ]);

      return res.status(200).json({
        predictions: predictions.map(p => ({
          id: p.id,
          title: p.title,
          description: p.description,
          options: p.options,
          entryFeeStars: p.entryFeeStars,
          entryFeePoints: p.entryFeePoints,
          pot: p.pot,
          resolved: p.resolved,
          winnerOption: p.winnerOption,
          endsAt: p.endsAt,
          createdAt: p.createdAt,
          creator: p.creator,
          participantCount: p._count.bets,
          totalBets: p.bets.length
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    }

    if (req.method === 'POST') {
      // Create new prediction - requires auth
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
            console.warn('No user in initData for POST /api/predictions');
          }
        } catch (err) {
          console.error('Failed to parse Telegram initData for POST /api/predictions:', err);
        }
      } else {
        console.warn('No X-Telegram-Init-Data header for POST /api/predictions');
      }

      // For POST, we still need a user, but return a friendly error instead of 401
      if (!userId) {
        return res.status(200).json({ 
          error: 'Authentication required to create predictions',
          message: 'Please open this app from Telegram to create predictions'
        });
      }

      const validation = createPredictionSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'Invalid request data',
          details: validation.error.errors
        });
      }

      const telegramId = BigInt(userId);
      const user = await prisma.user.findUnique({
        where: { telegramId }
      });

      if (!user) {
        return res.status(200).json({ 
          error: 'User not found',
          message: 'Please authenticate first'
        });
      }

      // Check if user has enough points/stars (if required)
      if (validation.data.entryFeePoints > 0 && user.points < validation.data.entryFeePoints) {
        return res.status(400).json({ error: 'Insufficient points' });
      }

      const prediction = await prisma.prediction.create({
        data: {
          title: validation.data.title,
          description: validation.data.description,
          options: validation.data.options,
          entryFeeStars: validation.data.entryFeeStars,
          entryFeePoints: validation.data.entryFeePoints,
          endsAt: new Date(validation.data.endsAt),
          creatorId: user.id,
          pot: 0,
          resolved: false
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              tier: true
            }
          }
        }
      });

      return res.status(201).json({ prediction });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Predictions API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
}

