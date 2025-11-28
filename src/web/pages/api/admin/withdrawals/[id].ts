/**
 * Admin Withdrawal Update API
 * 
 * PATCH /api/admin/withdrawals/[id]
 * 
 * Updates withdrawal status to 'paid' or 'rejected'.
 * Admin manually sends TON and records the transaction hash.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';

interface UpdateResponse {
  ok: boolean;
  withdrawal?: {
    id: string;
    status: string;
    txHash: string | null;
    paidAt: string | null;
  };
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdateResponse>
) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  // Verify admin token
  const adminToken = req.headers['x-admin-token'];
  if (adminToken !== process.env.ADMIN_PANEL_TOKEN) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    const { id } = req.query;
    const { status, txHash, rejectionReason } = req.body as {
      status?: 'paid' | 'rejected';
      txHash?: string;
      rejectionReason?: string;
    };

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, message: 'Invalid withdrawal ID' });
    }

    if (!status || !['paid', 'rejected'].includes(status)) {
      return res.status(400).json({ ok: false, message: 'Status must be "paid" or "rejected"' });
    }

    // Get current withdrawal
    const current = await prisma.withdrawalRequest.findUnique({
      where: { id },
    });

    if (!current) {
      return res.status(404).json({ ok: false, message: 'Withdrawal not found' });
    }

    if (current.status !== 'pending') {
      return res.status(400).json({ ok: false, message: `Withdrawal already ${current.status}` });
    }

    // Update withdrawal
    const updated = await prisma.withdrawalRequest.update({
      where: { id },
      data: {
        status,
        txHash: status === 'paid' ? txHash : null,
        rejectionReason: status === 'rejected' ? rejectionReason : null,
        paidAt: status === 'paid' ? new Date() : null,
      },
    });

    // If rejected, refund user (but not the fee)
    if (status === 'rejected') {
      await prisma.mystTransaction.create({
        data: {
          userId: current.userId,
          type: 'withdraw_refund',
          amount: current.mystBurn, // Refund the burn amount (fee is retained)
          meta: { withdrawalId: current.id, reason: rejectionReason },
        },
      });
    }

    console.log(`[AdminWithdrawals] Withdrawal ${id} marked as ${status}`);

    return res.status(200).json({
      ok: true,
      withdrawal: {
        id: updated.id,
        status: updated.status,
        txHash: updated.txHash,
        paidAt: updated.paidAt?.toISOString() ?? null,
      },
      message: `Withdrawal ${status === 'paid' ? 'marked as paid' : 'rejected'}`,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AdminWithdrawals] update failed:', message);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

