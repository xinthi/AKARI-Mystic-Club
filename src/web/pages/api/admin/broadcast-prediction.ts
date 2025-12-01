/**
 * Admin Broadcast Prediction API
 * 
 * Broadcasts a prediction to all promo groups
 * 
 * POST /api/admin/broadcast-prediction
 * Body: { predictionId: string }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { broadcastNewPrediction } from '../../../lib/telegram-bot';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify admin token
  const adminToken = process.env.ADMIN_PANEL_TOKEN;
  if (!adminToken) {
    return res.status(500).json({ ok: false, message: 'Admin panel not configured' });
  }

  const providedToken = req.headers['x-admin-token'] as string | undefined;
  if (!providedToken || providedToken !== adminToken) {
    return res.status(403).json({ ok: false, message: 'Forbidden' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const { predictionId } = req.body;
  
  if (!predictionId) {
    return res.status(400).json({ ok: false, message: 'predictionId required' });
  }

  try {
    // Get prediction details
    const prediction = await prisma.prediction.findUnique({
      where: { id: predictionId },
      select: {
        id: true,
        title: true,
        description: true,
        options: true,
        endsAt: true,
        status: true,
      },
    });

    if (!prediction) {
      return res.status(404).json({ ok: false, message: 'Prediction not found' });
    }

    if (prediction.status !== 'ACTIVE') {
      return res.status(400).json({ ok: false, message: 'Prediction is not active' });
    }

    // Broadcast to promo groups
    const result = await broadcastNewPrediction({
      id: prediction.id,
      title: prediction.title,
      description: prediction.description || undefined,
      options: prediction.options,
      endDate: prediction.endsAt || undefined,
    });

    return res.status(200).json({
      ok: true,
      message: `Broadcast sent to ${result.successCount} groups`,
      ...result,
    });
  } catch (error: any) {
    console.error('[Admin/BroadcastPrediction] Error:', error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

