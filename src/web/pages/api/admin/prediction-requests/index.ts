/**
 * Admin Prediction Requests API
 * 
 * GET /api/admin/prediction-requests - List all prediction requests
 * POST /api/admin/prediction-requests - Update request status (approve/reject)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../../lib/prisma';

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

  try {
    if (req.method === 'GET') {
      const { status } = req.query;

      const where: any = {};
      if (status && typeof status === 'string') {
        where.status = status;
      }

      const requests = await withDbRetry(() => prisma.predictionRequest.findMany({
        where,
        include: {
          createdBy: {
            select: { id: true, username: true, telegramId: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }));

      return res.status(200).json({ ok: true, requests });
    }

    if (req.method === 'POST') {
      const { requestId, action, createPrediction, endsAt } = req.body;

      if (!requestId || !action) {
        return res.status(400).json({ ok: false, message: 'requestId and action required' });
      }

      if (!['APPROVE', 'REJECT'].includes(action)) {
        return res.status(400).json({ ok: false, message: 'action must be APPROVE or REJECT' });
      }

      const request = await prisma.predictionRequest.findUnique({
        where: { id: requestId },
      });

      if (!request) {
        return res.status(404).json({ ok: false, message: 'Request not found' });
      }

      // Update status
      const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      await prisma.predictionRequest.update({
        where: { id: requestId },
        data: { status: newStatus },
      });

      let prediction = null;

      // Optionally create prediction on approval
      if (action === 'APPROVE' && createPrediction) {
        const expiryDate = endsAt 
          ? new Date(endsAt) 
          : request.proposedExpiry 
            || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default 7 days

        prediction = await prisma.prediction.create({
          data: {
            title: request.question,
            description: request.details,
            category: request.category,
            options: ['Yes', 'No'],
            endsAt: expiryDate,
            entryFeeMyst: 0, // Free to enter by default
            feeRate: 0.08,
          },
        });
        console.log(`[Admin/PredictionRequests] Created prediction ${prediction.id} from request ${requestId}`);
      }

      console.log(`[Admin/PredictionRequests] ${action} request ${requestId}`);

      return res.status(200).json({
        ok: true,
        status: newStatus,
        prediction: prediction ? { id: prediction.id, title: prediction.title } : null,
      });
    }

    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  } catch (error: any) {
    console.error('[Admin/PredictionRequests] Error:', error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

