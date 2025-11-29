/**
 * Admin Deposits API
 * 
 * GET /api/admin/deposits - List all deposits
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

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    const { status } = req.query;

    const where: any = {};
    if (status && status !== 'all') {
      where.status = status;
    }

    const deposits = await prisma.deposit.findMany({
      where,
      include: {
        user: {
          select: {
            username: true,
            firstName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return res.status(200).json({
      ok: true,
      deposits: deposits.map((d) => ({
        id: d.id,
        userId: d.userId,
        username: d.user.username,
        firstName: d.user.firstName,
        tonAmount: d.tonAmount,
        tonPriceUsd: d.tonPriceUsd,
        usdAmount: d.usdAmount,
        mystEstimate: d.mystEstimate,
        memo: d.memo,
        status: d.status,
        txHash: d.txHash,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error('[Admin/Deposits] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

