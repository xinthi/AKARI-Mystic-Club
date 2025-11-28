/**
 * Admin Campaigns API
 * 
 * GET /api/admin/campaigns - List all campaigns with tasks
 * POST /api/admin/campaigns - Create a new campaign
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

  try {
    if (req.method === 'GET') {
      // List all campaigns with tasks
      const campaigns = await prisma.campaign.findMany({
        include: {
          tasks: true,
          _count: {
            select: { progress: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({
        ok: true,
        campaigns: campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          status: c.status,
          rewards: c.rewards,
          startAt: c.startAt,
          endsAt: c.endsAt,
          starsFee: c.starsFee,
          mystFee: c.mystFee,
          tasks: c.tasks,
          participantCount: c._count.progress,
          createdAt: c.createdAt,
        })),
      });
    }

    if (req.method === 'POST') {
      // Create a new campaign
      const { name, description, rewards, status, startAt, endsAt, starsFee, mystFee } = req.body;

      if (!name) {
        return res.status(400).json({ ok: false, message: 'Name is required' });
      }

      const campaign = await prisma.campaign.create({
        data: {
          name,
          description: description || null,
          rewards: rewards || '',
          status: status || 'DRAFT',
          startAt: startAt ? new Date(startAt) : null,
          endsAt: endsAt ? new Date(endsAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
          starsFee: starsFee || 0,
          mystFee: mystFee || 0,
        },
      });

      console.log(`[Admin/Campaigns] Created campaign: ${campaign.id} - ${campaign.name}`);

      return res.status(201).json({
        ok: true,
        campaign,
      });
    }

    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  } catch (error: any) {
    console.error('[Admin/Campaigns] Error:', error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

