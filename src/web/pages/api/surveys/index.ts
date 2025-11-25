/**
 * Surveys API
 * 
 * GET: List active surveys
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const campaignId = req.query.campaignId as string | undefined;

    const where: any = {
      active: true
    };

    if (campaignId) {
      where.campaignId = campaignId;
    }

    const [surveys, total] = await Promise.all([
      prisma.survey.findMany({
        where,
        include: {
          createdBy: {
            select: {
              id: true,
              username: true,
              tier: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.survey.count({ where })
    ]);

    return res.status(200).json({
      surveys: surveys.map(survey => ({
        id: survey.id,
        title: survey.title,
        description: survey.description,
        campaignId: survey.campaignId,
        projectTgHandle: survey.projectTgHandle,
        createdAt: survey.createdAt,
        creator: survey.createdBy,
        responseCount: (survey.responses as any[]).length,
        hasReport: !!survey.report
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('Surveys API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
}

