/**
 * Admin Campaign Requests API
 * 
 * GET /api/admin/campaign-requests - List all campaign requests
 * POST /api/admin/campaign-requests - Update request status (approve/reject)
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
      const { status } = req.query;

      const where: any = {};
      if (status && typeof status === 'string') {
        where.status = status;
      }

      const requests = await prisma.campaignRequest.findMany({
        where,
        include: {
          createdBy: {
            select: { id: true, username: true, telegramId: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({ ok: true, requests });
    }

    if (req.method === 'POST') {
      const { requestId, action, createCampaign } = req.body;

      if (!requestId || !action) {
        return res.status(400).json({ ok: false, message: 'requestId and action required' });
      }

      if (!['APPROVE', 'REJECT'].includes(action)) {
        return res.status(400).json({ ok: false, message: 'action must be APPROVE or REJECT' });
      }

      const request = await prisma.campaignRequest.findUnique({
        where: { id: requestId },
      });

      if (!request) {
        return res.status(404).json({ ok: false, message: 'Request not found' });
      }

      // Update status
      const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      await prisma.campaignRequest.update({
        where: { id: requestId },
        data: { status: newStatus },
      });

      let campaign = null;

      // Optionally create campaign on approval
      if (action === 'APPROVE' && createCampaign) {
        campaign = await prisma.campaign.create({
          data: {
            name: request.projectName,
            description: request.details || request.goal || '',
            rewards: 'TBD',
            status: 'DRAFT',
            startAt: request.requestedStart,
            endsAt: request.requestedEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
        console.log(`[Admin/CampaignRequests] Created campaign ${campaign.id} from request ${requestId}`);
      }

      console.log(`[Admin/CampaignRequests] ${action} request ${requestId}`);

      return res.status(200).json({
        ok: true,
        status: newStatus,
        campaign: campaign ? { id: campaign.id, name: campaign.name } : null,
      });
    }

    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  } catch (error: any) {
    console.error('[Admin/CampaignRequests] Error:', error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

