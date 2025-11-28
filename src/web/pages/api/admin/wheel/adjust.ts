/**
 * Admin Wheel Adjust API
 * 
 * POST /api/admin/wheel/adjust
 * 
 * Manually adjust the wheel pool balance.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { getWheelPool } from '../../../../lib/myst-service';

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

    // Get current pool
    const pool = await getWheelPool(prisma);
    const newBalance = pool.balance + amount;

    // Don't allow negative pool balance
    if (newBalance < 0) {
      return res.status(400).json({ 
        ok: false, 
        message: `Cannot reduce pool below 0. Current balance: ${pool.balance.toFixed(2)}` 
      });
    }

    // Update pool
    await prisma.wheelPool.upsert({
      where: { id: 'main_pool' },
      update: { balance: newBalance },
      create: { id: 'main_pool', balance: newBalance },
    });

    console.log(`[Admin] Wheel pool adjusted by ${amount}. New balance: ${newBalance}`);

    return res.status(200).json({
      ok: true,
      newBalance,
    });
  } catch (error: any) {
    console.error('[/api/admin/wheel/adjust] Error:', error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

