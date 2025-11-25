/**
 * Campaign Detail API
 * 
 * GET: Get campaign details with tasks
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getTelegramUserFromRequest } from '../../../lib/telegram-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Campaign ID is required' });
    }

    const telegramUser = getTelegramUserFromRequest(req);
    const telegramId = telegramUser ? BigInt(telegramUser.id) : null;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            username: true,
            tier: true
          }
        }
      }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get user's completed tasks if authenticated
    let userCompletedTasks: string[] = [];
    if (telegramId) {
      const user = await prisma.user.findUnique({
        where: { telegramId },
        select: { completedTasks: true }
      });
      userCompletedTasks = (user?.completedTasks as string[]) || [];
    }

    // Add task status
    const tasksWithStatus = (campaign.tasks as any[]).map((task: any, index: number) => ({
      ...task,
      taskId: `${campaign.id}_${index}`,
      completed: userCompletedTasks.includes(`${campaign.id}_${index}`)
    }));

    return res.status(200).json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        rewards: campaign.rewards,
        tasks: campaign.tasks,
        tasksWithStatus,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
        starsFee: campaign.starsFee,
        projectTgHandle: campaign.projectTgHandle,
        isActive: campaign.isActive,
        createdAt: campaign.createdAt,
        creator: campaign.createdBy
      }
    });
  } catch (error: any) {
    console.error('Campaign detail API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
}

