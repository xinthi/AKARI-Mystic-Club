/**
 * Confirm Deposit API
 * 
 * POST /api/admin/deposits/[id]/confirm
 * 
 * Confirms a pending deposit and credits MYST to the user.
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
    const { txHash } = req.body;

    if (!txHash || typeof txHash !== 'string') {
      return res.status(400).json({ ok: false, message: 'txHash is required' });
    }

    // Get the deposit
    const deposit = await prisma.deposit.findUnique({
      where: { id },
    });

    if (!deposit) {
      return res.status(404).json({ ok: false, message: 'Deposit not found' });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({ ok: false, message: 'Deposit is not pending' });
    }

    // Use a transaction to update deposit and credit MYST
    const result = await prisma.$transaction(async (tx) => {
      // Update deposit status
      const updatedDeposit = await tx.deposit.update({
        where: { id },
        data: {
          status: 'confirmed',
          txHash,
          mystCredited: deposit.mystEstimate,
          confirmedAt: new Date(),
        },
      });

      // Credit MYST to user
      await tx.mystTransaction.create({
        data: {
          userId: deposit.userId,
          type: 'ton_deposit',
          amount: deposit.mystEstimate,
          meta: {
            depositId: deposit.id,
            tonAmount: deposit.tonAmount,
            txHash,
          },
        },
      });

      return updatedDeposit;
    });

    console.log(`[Admin/Deposits] Confirmed deposit ${id}, credited ${deposit.mystEstimate} MYST to ${deposit.userId}`);

    return res.status(200).json({
      ok: true,
      message: 'Deposit confirmed',
      mystCredited: deposit.mystEstimate,
      deposit: result,
    });
  } catch (error: any) {
    console.error('[Admin/Deposits] Confirm error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

