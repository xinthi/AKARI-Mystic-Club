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
        campaigns: campaigns.map((c: any) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          status: c.status || 'ACTIVE', // Default for old records without status
          rewards: c.rewards,
          startAt: c.startAt,
          endsAt: c.endsAt,
          starsFee: c.starsFee || 0,
          mystFee: c.mystFee || 0,
          tasks: c.tasks || [],
          participantCount: c._count?.progress || 0,
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

      // Build data object without status if we're not sure it exists
      const campaignData: any = {
        name,
        description: description || null,
        rewards: rewards || '',
        startAt: startAt ? new Date(startAt) : null,
        endsAt: endsAt ? new Date(endsAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
        starsFee: starsFee || 0,
        mystFee: mystFee || 0,
      };

      // Try with status first, then without if it fails
      let campaign;
      try {
        campaignData.status = status || 'DRAFT';
        campaign = await prisma.campaign.create({ data: campaignData });
      } catch (statusError) {
        // Status field might not exist, try without it
        console.warn('[Admin/Campaigns] Status field not available, creating without status');
        delete campaignData.status;
        campaign = await prisma.campaign.create({ data: campaignData });
      }

      console.log(`[Admin/Campaigns] Created campaign: ${campaign.id} - ${campaign.name}`);

      return res.status(201).json({
        ok: true,
        campaign: {
          ...campaign,
          status: (campaign as any).status || 'DRAFT',
        },
      });
    }

    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  } catch (error: any) {
    console.error('[Admin/Campaigns] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: error?.message || 'Server error' });
  }
}
