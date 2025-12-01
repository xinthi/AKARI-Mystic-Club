/**
 * Admin Withdrawals List API
 * 
 * GET /api/admin/withdrawals?status=pending|paid|rejected
 * 
 * Lists withdrawal requests for admin to process manually.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../../lib/prisma';

interface WithdrawalRow {
  id: string;
  userId: string;
  username: string | null;
  telegramId: string;
  tonAddress: string;
  mystRequested: number;
  mystFee: number;
  mystBurn: number;
  usdNet: number;
  tonAmount: number;
  tonPriceUsd: number;
  status: string;
  txHash: string | null;
  createdAt: string;
  paidAt: string | null;
}

interface WithdrawalsResponse {
  ok: boolean;
  withdrawals?: WithdrawalRow[];
  total?: number;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithdrawalsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  // Verify admin token
  const adminToken = req.headers['x-admin-token'];
  if (adminToken !== process.env.ADMIN_PANEL_TOKEN) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    const status = req.query.status as string | undefined;
    
    const whereClause = status ? { status } : {};

    const withdrawals = await withDbRetry(() => prisma.withdrawalRequest.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            username: true,
            telegramId: true,
          },
        },
      },
    }));

    const rows: WithdrawalRow[] = withdrawals.map(w => ({
      id: w.id,
      userId: w.userId,
      username: w.user.username,
      telegramId: w.user.telegramId,
      tonAddress: w.tonAddress,
      mystRequested: w.mystRequested,
      mystFee: w.mystFee,
      mystBurn: w.mystBurn,
      usdNet: w.usdNet,
      tonAmount: w.tonAmount,
      tonPriceUsd: w.tonPriceUsd,
      status: w.status,
      txHash: w.txHash,
      createdAt: w.createdAt.toISOString(),
      paidAt: w.paidAt?.toISOString() ?? null,
    }));

    return res.status(200).json({
      ok: true,
      withdrawals: rows,
      total: rows.length,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AdminWithdrawals] list failed:', message);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

