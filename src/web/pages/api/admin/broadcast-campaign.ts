/**
 * Admin Broadcast Campaign API
 * 
 * Broadcasts a campaign to all promo groups
 * 
 * POST /api/admin/broadcast-campaign
 * Body: { campaignId: string }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { broadcastNewCampaign } from '../../../lib/telegram-bot';

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

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const { campaignId } = req.body;
  
  if (!campaignId) {
    return res.status(400).json({ ok: false, message: 'campaignId required' });
  }

  try {
    // Get campaign details
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        name: true,
        description: true,
        endsAt: true,
        status: true,
      },
    });

    if (!campaign) {
      return res.status(404).json({ ok: false, message: 'Campaign not found' });
    }

    if (campaign.status !== 'ACTIVE') {
      return res.status(400).json({ ok: false, message: 'Campaign is not active' });
    }

    // Broadcast to promo groups
    const result = await broadcastNewCampaign({
      id: campaign.id,
      name: campaign.name,
      description: campaign.description || undefined,
      endDate: campaign.endsAt || undefined,
    });

    return res.status(200).json({
      ok: true,
      message: `Broadcast sent to ${result.successCount} groups`,
      ...result,
    });
  } catch (error: any) {
    console.error('[Admin/BroadcastCampaign] Error:', error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

