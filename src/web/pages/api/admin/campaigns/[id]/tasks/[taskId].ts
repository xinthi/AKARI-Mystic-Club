/**
 * Admin Campaign Task API
 * 
 * DELETE: Delete a task from a campaign
 * PATCH: Update a task
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../../../lib/prisma';

interface TaskResponse {
  ok: boolean;
  message?: string;
  task?: any;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TaskResponse>
) {
  // Verify admin token
  const adminToken = req.headers['x-admin-token'];
  if (adminToken !== process.env.ADMIN_PANEL_TOKEN) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  const { id: campaignId, taskId } = req.query;
  
  if (!campaignId || typeof campaignId !== 'string') {
    return res.status(400).json({ ok: false, message: 'Invalid campaign ID' });
  }
  
  if (!taskId || typeof taskId !== 'string') {
    return res.status(400).json({ ok: false, message: 'Invalid task ID' });
  }

  // DELETE: Remove task
  if (req.method === 'DELETE') {
    try {
      // Verify task exists and belongs to campaign
      const task = await prisma.campaignTask.findFirst({
        where: {
          id: taskId,
          campaignId,
        },
      });

      if (!task) {
        return res.status(404).json({ ok: false, message: 'Task not found' });
      }

      // Delete task (will cascade delete progress)
      await prisma.campaignTask.delete({
        where: { id: taskId },
      });

      console.log(`[AdminTask] Deleted task ${taskId} from campaign ${campaignId}`);

      return res.status(200).json({
        ok: true,
        message: 'Task deleted',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AdminTask] Delete failed:', message);
      return res.status(500).json({ ok: false, message: 'Failed to delete task' });
    }
  }

  // PATCH: Update task
  if (req.method === 'PATCH') {
    try {
      const { title, description, type, targetUrl, rewardPoints } = req.body;

      // Verify task exists and belongs to campaign
      const existingTask = await prisma.campaignTask.findFirst({
        where: {
          id: taskId,
          campaignId,
        },
      });

      if (!existingTask) {
        return res.status(404).json({ ok: false, message: 'Task not found' });
      }

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (type !== undefined) updateData.type = type;
      if (targetUrl !== undefined) updateData.targetUrl = targetUrl;
      if (rewardPoints !== undefined) updateData.rewardPoints = Number(rewardPoints);

      const task = await prisma.campaignTask.update({
        where: { id: taskId },
        data: updateData,
      });

      console.log(`[AdminTask] Updated task ${taskId}`);

      return res.status(200).json({
        ok: true,
        task,
        message: 'Task updated',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AdminTask] Update failed:', message);
      return res.status(500).json({ ok: false, message: 'Failed to update task' });
    }
  }

  return res.status(405).json({ ok: false, message: 'Method not allowed' });
}

