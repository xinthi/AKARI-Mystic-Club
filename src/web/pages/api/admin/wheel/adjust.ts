/**
 * Admin Wheel Adjust API
 * 
 * POST /api/admin/wheel/adjust
 * 
 * Manually adjust the wheel pool balance.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { getWheelPoolBalance, POOL_IDS } from '../../../../lib/myst-service';

interface AdjustResponse {
  ok: boolean;
  newBalance?: number;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdjustResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  // Verify admin token
  const adminToken = req.headers['x-admin-token'];
  if (adminToken !== process.env.ADMIN_PANEL_TOKEN) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    const { amount } = req.body;

    if (typeof amount !== 'number' || isNaN(amount)) {
      return res.status(400).json({ ok: false, message: 'Invalid amount' });
    }

    // Get current pool balance
    const currentBalance = await getWheelPoolBalance(prisma);
    const newBalance = currentBalance + amount;

    // Don't allow negative pool balance
    if (newBalance < 0) {
      return res.status(400).json({ 
        ok: false, 
        message: `Cannot reduce pool below 0. Current balance: ${currentBalance.toFixed(2)}` 
      });
    }

    // Update both WheelPool and PoolBalance
    await prisma.$transaction([
      prisma.wheelPool.upsert({
        where: { id: 'main_pool' },
        update: { balance: newBalance },
        create: { id: 'main_pool', balance: newBalance },
      }),
      prisma.poolBalance.upsert({
        where: { id: POOL_IDS.WHEEL },
        update: { balance: newBalance },
        create: { id: POOL_IDS.WHEEL, balance: newBalance },
      }),
    ]);

    console.log(`[Admin] Wheel pool adjusted by ${amount}. New balance: ${newBalance}`);

    return res.status(200).json({
      ok: true,
      newBalance,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Admin] wheel/adjust failed:', message);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}
