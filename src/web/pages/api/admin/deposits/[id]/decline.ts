/**
 * Decline Deposit API
 * 
 * POST /api/admin/deposits/[id]/decline
 * 
 * Declines a pending deposit with a reason for audit tracking.
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

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, message: 'Invalid deposit ID' });
  }

  try {
    const { reason, adminName } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ ok: false, message: 'Decline reason is required' });
    }

    // Get the deposit
    const deposit = await prisma.deposit.findUnique({
      where: { id },
      include: {
        user: {
          select: { username: true, firstName: true },
        },
      },
    });

    if (!deposit) {
      return res.status(404).json({ ok: false, message: 'Deposit not found' });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({ ok: false, message: `Deposit is already ${deposit.status}` });
    }

    // Update deposit to declined
    const updated = await prisma.deposit.update({
      where: { id },
      data: {
        status: 'declined',
        declinedReason: reason.trim(),
        declinedAt: new Date(),
        declinedBy: adminName || 'Admin',
      },
    });

    console.log(`[Admin/Deposits] Declined deposit ${id} for user ${deposit.userId}. Reason: ${reason}`);

    return res.status(200).json({
      ok: true,
      message: 'Deposit declined',
      deposit: {
        id: updated.id,
        status: updated.status,
        declinedReason: updated.declinedReason,
        declinedAt: updated.declinedAt?.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Admin/Deposits] Decline error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

