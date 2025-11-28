/**
 * Admin Campaign Tasks API
 * 
 * POST /api/admin/campaigns/[id]/tasks - Create a new task for campaign
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../../lib/prisma';

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

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, message: 'Invalid campaign ID' });
  }

  try {
    if (req.method === 'POST') {
      // Verify campaign exists
      const campaign = await prisma.campaign.findUnique({ where: { id } });
      if (!campaign) {
        return res.status(404).json({ ok: false, message: 'Campaign not found' });
      }

      const { title, description, type, targetUrl, proofType, rewardPoints, metadata } = req.body;

      if (!title || !type) {
        return res.status(400).json({ ok: false, message: 'Title and type are required' });
      }

      const task = await prisma.campaignTask.create({
        data: {
          campaignId: id,
          title,
          description: description || null,
          type,
          targetUrl: targetUrl || null,
          proofType: proofType || null,
          rewardPoints: rewardPoints || 0,
          metadata: metadata || null,
        },
      });

      console.log(`[Admin/CampaignTasks] Created task: ${task.id} for campaign ${id}`);

      return res.status(201).json({ ok: true, task });
    }

    if (req.method === 'DELETE') {
      const { taskId } = req.body;
      if (!taskId) {
        return res.status(400).json({ ok: false, message: 'taskId required' });
      }

      await prisma.campaignTask.delete({ where: { id: taskId } });
      console.log(`[Admin/CampaignTasks] Deleted task: ${taskId}`);
      return res.status(200).json({ ok: true, message: 'Task deleted' });
    }

    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  } catch (error: any) {
    console.error('[Admin/CampaignTasks] Error:', error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

