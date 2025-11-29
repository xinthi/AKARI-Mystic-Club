/**
 * Admin Predictions API
 * 
 * GET: List all predictions with stats
 * POST: Create a new prediction
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';

interface AdminResponse {
  ok: boolean;
  predictions?: any[];
  prediction?: any;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminResponse>
) {
  // Verify admin token
  const adminToken = req.headers['x-admin-token'];
  if (adminToken !== process.env.ADMIN_PANEL_TOKEN) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  // GET: List all predictions
  if (req.method === 'GET') {
    try {
      const predictions = await prisma.prediction.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { bets: true },
          },
          bets: {
            select: { mystBet: true },
          },
        },
      });

      const formattedPredictions = predictions.map((p: any) => {
        // Find index of winning option if resolved
        const winningOptionIndex = p.winningOption 
          ? p.options.indexOf(p.winningOption) 
          : undefined;
        
        // Derive status from resolved field if status doesn't exist
        let status = p.status;
        if (!status) {
          if (p.resolved) {
            status = 'RESOLVED';
          } else if (p.endsAt && new Date(p.endsAt) < new Date()) {
            status = 'PAUSED';
          } else {
            status = 'ACTIVE';
          }
        }
        
        return {
          id: p.id,
          title: p.title,
          description: p.description,
          category: p.category || 'other',
          options: p.options,
          status,
          winningOption: winningOptionIndex !== undefined && winningOptionIndex >= 0 
            ? winningOptionIndex 
            : undefined,
          totalPool: p.bets?.reduce((sum: number, bet: any) => sum + (bet.mystBet ?? 0), 0) || 0,
          betCount: p._count?.bets || 0,
          createdAt: p.createdAt.toISOString(),
          endsAt: p.endsAt?.toISOString() || null,
        };
      });

      return res.status(200).json({ ok: true, predictions: formattedPredictions });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AdminPredictions] List failed:', message);
      return res.status(500).json({ ok: false, message: 'Failed to load predictions' });
    }
  }

  // POST: Create new prediction
  if (req.method === 'POST') {
    try {
      const { title, description, category, options, endsAt, status } = req.body;

      if (!title || !options || !Array.isArray(options) || options.length < 2) {
        return res.status(400).json({ 
          ok: false, 
          message: 'Title and at least 2 options are required' 
        });
      }

      // Build data object - try with all fields first
      const predictionData: any = {
        title,
        description: description || null,
        category: category || 'other',
        options,
        endsAt: endsAt ? new Date(endsAt) : null,
      };

      // Try with status first, fallback without
      let prediction;
      try {
        predictionData.status = status || 'DRAFT';
        prediction = await prisma.prediction.create({ data: predictionData });
      } catch (statusError) {
        // Status field might not exist in schema, try without
        console.warn('[AdminPredictions] Status field not available, creating without status');
        delete predictionData.status;
        prediction = await prisma.prediction.create({ data: predictionData });
      }

      console.log(`[AdminPredictions] Created prediction: ${prediction.id} - ${title}`);

      return res.status(201).json({ 
        ok: true, 
        prediction: {
          id: prediction.id,
          title: prediction.title,
          status: (prediction as any).status || 'DRAFT',
        },
        message: 'Prediction created successfully',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AdminPredictions] Create failed:', message);
      return res.status(500).json({ ok: false, message: `Failed to create prediction: ${message}` });
    }
  }

  return res.status(405).json({ ok: false, message: 'Method not allowed' });
}
