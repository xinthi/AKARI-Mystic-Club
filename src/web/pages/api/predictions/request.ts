/**
 * Prediction Request API
 * 
 * POST /api/predictions/request - Submit a new prediction market request
 * 
 * Allows any authenticated user to request a new prediction market.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';

interface PredictionRequestBody {
  question: string;
  category?: string;
  proposedExpiry?: string;
  details?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    // Authenticate user (optional)
    const user = await getUserFromRequest(req, prisma);

    const { question, category, proposedExpiry, details } = req.body as PredictionRequestBody;

    // Validate required fields
    if (!question || question.trim().length < 10) {
      return res.status(400).json({
        ok: false,
        message: 'Question is required (minimum 10 characters)',
      });
    }

    // Create prediction request
    const predictionRequest = await prisma.predictionRequest.create({
      data: {
        question: question.trim(),
        category: category || null,
        proposedExpiry: proposedExpiry ? new Date(proposedExpiry) : null,
        details: details || null,
        createdById: user?.id || null,
        status: 'PENDING',
      },
    });

    console.log(`[PredictionRequests] New request: ${predictionRequest.id} - "${question.slice(0, 50)}..."`);

    return res.status(201).json({
      ok: true,
      requestId: predictionRequest.id,
      message: 'Thanks! Our team will review your prediction market request.',
    });

  } catch (error: any) {
    console.error('[PredictionRequests] Error:', error);
    return res.status(500).json({ ok: false, message: 'Failed to submit request' });
  }
}

