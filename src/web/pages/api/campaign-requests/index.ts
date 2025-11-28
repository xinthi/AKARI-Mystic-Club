/**
 * Campaign Requests API
 * 
 * POST /api/campaign-requests - Submit a new campaign request
 * 
 * Allows any authenticated user to request a campaign.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';

interface CampaignRequestBody {
  projectName: string;
  contactHandle: string;
  contactTelegram?: string;
  contactX?: string;
  goal?: string;
  requestedStart?: string;
  requestedEnd?: string;
  details?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    // Authenticate user (optional - requests can be anonymous)
    const user = await getUserFromRequest(req, prisma);

    const {
      projectName,
      contactHandle,
      contactTelegram,
      contactX,
      goal,
      requestedStart,
      requestedEnd,
      details,
    } = req.body as CampaignRequestBody;

    // Validate required fields
    if (!projectName || !contactHandle) {
      return res.status(400).json({
        ok: false,
        message: 'Project name and contact handle are required',
      });
    }

    // Create campaign request
    const campaignRequest = await prisma.campaignRequest.create({
      data: {
        projectName,
        contactHandle,
        contactTelegram: contactTelegram || null,
        contactX: contactX || null,
        goal: goal || null,
        requestedStart: requestedStart ? new Date(requestedStart) : null,
        requestedEnd: requestedEnd ? new Date(requestedEnd) : null,
        details: details || null,
        createdById: user?.id || null,
        status: 'PENDING',
      },
    });

    console.log(`[CampaignRequests] New request: ${campaignRequest.id} from ${contactHandle}`);

    return res.status(201).json({
      ok: true,
      requestId: campaignRequest.id,
      message: 'Thanks! Our team will review your campaign request.',
    });

  } catch (error: any) {
    console.error('[CampaignRequests] Error:', error);
    return res.status(500).json({ ok: false, message: 'Failed to submit request' });
  }
}

