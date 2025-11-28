/**
 * Admin Campaign Detail API
 * 
 * GET /api/admin/campaigns/[id] - Get campaign details
 * PATCH /api/admin/campaigns/[id] - Update campaign
 * DELETE /api/admin/campaigns/[id] - Delete campaign
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';

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
    if (req.method === 'GET') {
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        include: { tasks: true },
      });

      if (!campaign) {
        return res.status(404).json({ ok: false, message: 'Campaign not found' });
      }

      return res.status(200).json({ ok: true, campaign });
    }

    if (req.method === 'PATCH') {
      const { name, description, rewards, status, startAt, endsAt, starsFee, mystFee } = req.body;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (rewards !== undefined) updateData.rewards = rewards;
      if (status !== undefined) updateData.status = status;
      if (startAt !== undefined) updateData.startAt = startAt ? new Date(startAt) : null;
      if (endsAt !== undefined) updateData.endsAt = new Date(endsAt);
      if (starsFee !== undefined) updateData.starsFee = starsFee;
      if (mystFee !== undefined) updateData.mystFee = mystFee;

      const campaign = await prisma.campaign.update({
        where: { id },
        data: updateData,
        include: { tasks: true },
      });

      console.log(`[Admin/Campaigns] Updated campaign: ${id}`);

      return res.status(200).json({ ok: true, campaign });
    }

    if (req.method === 'DELETE') {
      await prisma.campaign.delete({ where: { id } });
      console.log(`[Admin/Campaigns] Deleted campaign: ${id}`);
      return res.status(200).json({ ok: true, message: 'Campaign deleted' });
    }

    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  } catch (error: any) {
    console.error('[Admin/Campaigns] Error:', error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

