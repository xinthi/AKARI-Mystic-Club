/**
 * Campaigns API
 * 
 * GET: List active campaigns
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
          console.warn('No user in initData for GET /api/campaigns');
        }
      } catch (err) {
        console.error('Failed to parse Telegram initData for GET /api/campaigns:', err);
      }
    } else {
      console.warn('No X-Telegram-Init-Data header for GET /api/campaigns');
    }

    const telegramId = userId ? BigInt(userId) : null;

    const where: any = {
      isActive: true,
      endsAt: { gte: new Date() },
      startsAt: { lte: new Date() }
    };

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
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
      prisma.campaign.count({ where })
    ]);

    // Get user's completed tasks if authenticated
    let userCompletedTasks: string[] = [];
    if (telegramId) {
      const user = await prisma.user.findUnique({
        where: { telegramId },
        select: { completedTasks: true }
      });
      userCompletedTasks = (user?.completedTasks as string[]) || [];
    }

    return res.status(200).json({
      campaigns: campaigns.map(campaign => ({
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        rewards: campaign.rewards,
        tasks: campaign.tasks,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
        starsFee: campaign.starsFee,
        projectTgHandle: campaign.projectTgHandle,
        createdAt: campaign.createdAt,
        creator: campaign.createdBy,
        // Mark which tasks user has completed
        tasksWithStatus: (campaign.tasks as any[]).map((task: any, index: number) => ({
          ...task,
          taskId: `${campaign.id}_${index}`,
          completed: userCompletedTasks.includes(`${campaign.id}_${index}`)
        }))
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('Campaigns API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
}

