/**
 * MYST Balance API
 * 
 * GET /api/myst/balance
 * Returns user's current MYST balance and recent transactions.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { getMystBalance } from '../../../lib/myst-service';

type Data =
  | {
      ok: true;
      balance: number;
      recentTransactions: Array<{
        id: string;
        type: string;
        amount: number;
        createdAt: string;
      }>;
    }
  | { ok: false; reason: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, reason: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await getUserFromRequest(req, prisma);
    if (!user) {
      return res.status(401).json({ ok: false, reason: 'Unauthorized' });
    }

    // Get balance
    const balance = await getMystBalance(prisma, user.id);

    // Get recent transactions (last 20)
    const recentTransactions = await prisma.mystTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        type: true,
        amount: true,
        createdAt: true,
      },
    });

    return res.status(200).json({
      ok: true,
      balance,
      recentTransactions: recentTransactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error('[/api/myst/balance] Error:', error);
    return res.status(500).json({ ok: false, reason: 'Server error' });
  }
}

