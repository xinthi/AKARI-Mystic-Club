/**
 * Admin Withdrawal Update API
 * 
 * PATCH /api/admin/withdrawals/[id]
 * 
 * Updates withdrawal status to 'paid' or 'rejected'.
 * Admin manually sends TON and records the transaction hash.
 * 
 * Also supports recalculating TON amount with live price.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { getTonPriceUsd } from '../../../../lib/myst-price';
import { USD_PER_MYST } from '../../../../lib/myst-service';

interface UpdateResponse {
  ok: boolean;
  withdrawal?: {
    id: string;
    status: string;
    txHash: string | null;
    paidAt: string | null;
    tonAmount?: number;
    tonPriceUsd?: number;
  };
  recalculation?: {
    originalTonPrice: number;
    originalTonAmount: number;
    currentTonPrice: number;
    currentTonAmount: number;
    priceDiff: number;
    tonDiff: number;
  };
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdateResponse>
) {
  // Verify admin token
  const adminToken = req.headers['x-admin-token'];
  if (adminToken !== process.env.ADMIN_PANEL_TOKEN) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, message: 'Invalid withdrawal ID' });
  }

  // Handle GET for recalculation preview
  if (req.method === 'GET') {
    try {
      const withdrawal = await prisma.withdrawalRequest.findUnique({
        where: { id },
      });

      if (!withdrawal) {
        return res.status(404).json({ ok: false, message: 'Withdrawal not found' });
      }

      // Get live price
      const { priceUsd: currentTonPrice } = await getTonPriceUsd();
      const currentTonAmount = withdrawal.usdNet / currentTonPrice;

      const priceDiff = ((currentTonPrice - withdrawal.tonPriceUsd) / withdrawal.tonPriceUsd) * 100;
      const tonDiff = currentTonAmount - withdrawal.tonAmount;

      return res.status(200).json({
        ok: true,
        recalculation: {
          originalTonPrice: withdrawal.tonPriceUsd,
          originalTonAmount: withdrawal.tonAmount,
          currentTonPrice,
          currentTonAmount,
          priceDiff,
          tonDiff,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AdminWithdrawals] recalc failed:', message);
      return res.status(500).json({ ok: false, message: 'Server error' });
    }
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    const { status, txHash, rejectionReason, recalculatePrice } = req.body as {
      status?: 'paid' | 'rejected';
      txHash?: string;
      rejectionReason?: string;
      recalculatePrice?: boolean;
    };

    // Get current withdrawal
    const current = await prisma.withdrawalRequest.findUnique({
      where: { id },
    });

    if (!current) {
      return res.status(404).json({ ok: false, message: 'Withdrawal not found' });
    }

    // Handle recalculation request (admin tool)
    if (recalculatePrice && current.status === 'pending') {
      const { priceUsd: newTonPrice } = await getTonPriceUsd();
      const newTonAmount = current.usdNet / newTonPrice;

      const updated = await prisma.withdrawalRequest.update({
        where: { id },
        data: {
          tonPriceUsd: newTonPrice,
          tonAmount: newTonAmount,
        },
      });

      console.log(`[AdminWithdrawals] Recalculated ${id}: ${current.tonAmount.toFixed(4)} → ${newTonAmount.toFixed(4)} TON @ $${newTonPrice.toFixed(2)}`);

      return res.status(200).json({
        ok: true,
        withdrawal: {
          id: updated.id,
          status: updated.status,
          txHash: updated.txHash,
          paidAt: updated.paidAt?.toISOString() ?? null,
          tonAmount: updated.tonAmount,
          tonPriceUsd: updated.tonPriceUsd,
        },
        message: `Recalculated: ${newTonAmount.toFixed(4)} TON @ $${newTonPrice.toFixed(2)}/TON`,
      });
    }

    // Normal status update
    if (!status || !['paid', 'rejected'].includes(status)) {
      return res.status(400).json({ ok: false, message: 'Status must be "paid" or "rejected"' });
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
          meta: JSON.parse(JSON.stringify({ 
            withdrawalId: current.id, 
            reason: rejectionReason 
          })),
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
