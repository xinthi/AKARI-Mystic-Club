/**
 * Admin Deposits API
 * 
 * GET /api/admin/deposits - List all deposits with filters
 * 
 * Query params:
 * - status: 'pending' | 'confirmed' | 'declined' | 'all'
 * - from: ISO date string (filter createdAt >= from)
 * - to: ISO date string (filter createdAt <= to)
 * - limit: number (default 100)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../../lib/prisma';

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
    const { status, from, to, limit } = req.query;

    const where: any = {};
    
    // Status filter
    if (status && status !== 'all') {
      where.status = status;
    }

    // Date range filter
    if (from || to) {
      where.createdAt = {};
      if (from && typeof from === 'string') {
        where.createdAt.gte = new Date(from);
      }
      if (to && typeof to === 'string') {
        // Add 1 day to include the end date fully
        const toDate = new Date(to);
        toDate.setDate(toDate.getDate() + 1);
        where.createdAt.lte = toDate;
      }
    }

    const takeLimit = limit ? parseInt(limit as string, 10) : 100;

    const deposits = await withDbRetry(() => prisma.deposit.findMany({
      where,
      include: {
        user: {
          select: {
            username: true,
            firstName: true,
            tonAddress: true,
            telegramId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(takeLimit, 500), // Max 500
    }));

    return res.status(200).json({
      ok: true,
      deposits: deposits.map((d) => ({
        id: d.id,
        userId: d.userId,
        telegramId: d.user.telegramId,
        username: d.user.username,
        firstName: d.user.firstName,
        userWallet: d.user.tonAddress,
        tonAmount: d.tonAmount,
        tonPriceUsd: d.tonPriceUsd,
        usdAmount: d.usdAmount,
        mystEstimate: d.mystEstimate,
        mystCredited: d.mystCredited,
        memo: d.memo,
        status: d.status,
        txHash: d.txHash,
        confirmedAt: d.confirmedAt?.toISOString(),
        declinedReason: (d as any).declinedReason || null,
        declinedAt: (d as any).declinedAt?.toISOString() || null,
        declinedBy: (d as any).declinedBy || null,
        createdAt: d.createdAt.toISOString(),
      })),
      count: deposits.length,
    });
  } catch (error: any) {
    console.error('[Admin/Deposits] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}
