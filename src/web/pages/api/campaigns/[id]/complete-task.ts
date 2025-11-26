/**
 * Complete Campaign Task API
 *
 * POST: Mark a task as completed for the current user
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { getUserFromRequest } from '../../../../lib/telegram-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'Method not allowed' });
  }

  // Get authenticated user
  const user = await getUserFromRequest(req, prisma);
  if (!user) {
    return res.status(401).json({ ok: false, reason: 'Not authenticated' });
  }

  const campaignId = String(req.query.id);
  const { taskId } = req.body as { taskId?: string };

  if (!taskId) {
    return res.status(400).json({ ok: false, reason: 'Missing taskId' });
  }

  try {
    // Find campaign
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return res.status(404).json({ ok: false, reason: 'Campaign not found' });
    }

    // Verify task exists and belongs to campaign
    const task = await prisma.campaignTask.findFirst({
      where: {
        id: taskId,
        campaignId,
      },
    });

    if (!task) {
      return res.status(404).json({ ok: false, reason: 'Task not found' });
    }

    // Check if task was already completed - prevent double points
    const existingProgress = await prisma.campaignUserProgress.findFirst({
      where: {
        userId: user.id,
        taskId,
      },
    });

    if (existingProgress?.completed) {
      // Task already completed - don't award points again
      return res.status(200).json({
        ok: true,
        alreadyCompleted: true,
        message: 'Task was already completed',
      });
    }

    // Award points only when task goes from not-completed to completed
    const pointsToAward = 10;

    if (existingProgress) {
      // Progress exists but not completed - update it
      await prisma.campaignUserProgress.update({
        where: { id: existingProgress.id },
        data: {
          completed: true,
          completedAt: new Date(),
        },
      });
    } else {
      // No progress exists - create it
      await prisma.campaignUserProgress.create({
        data: {
          userId: user.id,
          campaignId,
          taskId,
          completed: true,
          completedAt: new Date(),
        },
      });
    }

    // Award points exactly once
    await prisma.user.update({
      where: { id: user.id },
      data: {
        points: { increment: pointsToAward },
      },
    });

    // Get updated progress for this campaign
    const allProgress = await prisma.campaignUserProgress.findMany({
      where: {
        userId: user.id,
        campaignId,
      },
    });

    return res.status(200).json({
      ok: true,
      message: `Task completed! +${pointsToAward} EP`,
      progress: allProgress.map((p) => ({
        taskId: p.taskId,
        completed: p.completed,
      })),
    });
  } catch (e: any) {
    console.error('Complete-task API error:', e);
    return res.status(500).json({ ok: false, reason: 'Server error' });
  }
}
