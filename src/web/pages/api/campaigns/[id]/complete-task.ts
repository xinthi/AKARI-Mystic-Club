/**
 * Complete Task API
 * 
 * POST: Mark a task as completed for the user
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
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
          console.warn('No user in initData for POST /api/campaigns/[id]/complete-task');
        }
      } catch (err) {
        console.error('Failed to parse Telegram initData for POST /api/campaigns/[id]/complete-task:', err);
      }
    } else {
      console.warn('No X-Telegram-Init-Data header for POST /api/campaigns/[id]/complete-task');
    }

    // For POST, we need a user, but return a friendly error instead of 401
    if (!userId) {
      return res.status(200).json({ 
        error: 'Authentication required',
        message: 'Please open this app from Telegram to complete tasks'
      });
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

    const telegramId = BigInt(userId);
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

