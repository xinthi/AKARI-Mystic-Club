/**
 * Complete Task API
 * 
 * POST: Mark a task as completed for the user
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { getTelegramUserFromRequest } from '../../../../lib/telegram-auth';
import { z } from 'zod';
import { updateTier } from '../../../../lib/tiers';

const completeTaskSchema = z.object({
  taskIndex: z.number().int().min(0),
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
      return res.status(400).json({ error: 'Campaign ID is required' });
    }

    const validation = completeTaskSchema.safeParse(req.body);
    
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

    // Get campaign
    const campaign = await prisma.campaign.findUnique({
      where: { id }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (!campaign.isActive) {
      return res.status(400).json({ error: 'Campaign is not active' });
    }

    if (new Date(campaign.endsAt) < new Date()) {
      return res.status(400).json({ error: 'Campaign has ended' });
    }

    // Check task index is valid
    const tasks = campaign.tasks as any[];
    if (validation.data.taskIndex >= tasks.length) {
      return res.status(400).json({ error: 'Invalid task index' });
    }

    const taskId = `${id}_${validation.data.taskIndex}`;
    const completedTasks = (user.completedTasks as string[]) || [];

    // Check if task already completed
    if (completedTasks.includes(taskId)) {
      return res.status(400).json({ error: 'Task already completed' });
    }

    // Mark task as completed and award points
    const updatedTasks = [...completedTasks, taskId];
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        completedTasks: updatedTasks,
        points: {
          increment: 1 // Award 1 point per task (Int field requires integer)
        }
      }
    });

    // Update tier
    await updateTier(updatedUser.id, updatedUser.points);

    return res.status(200).json({
      success: true,
      message: 'Task completed! You earned 1 EP.',
      points: updatedUser.points,
      tier: updatedUser.tier
    });
  } catch (error: any) {
    console.error('Complete task API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
}

