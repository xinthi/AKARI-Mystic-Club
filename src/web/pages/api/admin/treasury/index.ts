/**
 * Admin Treasury API
 * 
 * GET: Get all pool balances
 * POST: Transfer MYST between pools
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { POOL_IDS, getPoolBalance, updatePoolBalance } from '../../../../lib/myst-service';

interface PoolInfo {
  id: string;
  name: string;
  balance: number;
  description: string;
}

interface TreasuryResponse {
  ok: boolean;
  pools?: PoolInfo[];
  totalMyst?: number;
  transfer?: {
    from: string;
    to: string;
    amount: number;
    newFromBalance: number;
    newToBalance: number;
  };
  message?: string;
}

// Pool metadata
const POOL_METADATA: Record<string, { name: string; description: string }> = {
  [POOL_IDS.TREASURY]: {
    name: 'Platform Treasury',
    description: 'Main treasury. 70% of all spending goes here. Used to fund withdrawals.',
  },
  [POOL_IDS.LEADERBOARD]: {
    name: 'Leaderboard Pool',
    description: '15% of spending. Reserved for weekly leaderboard rewards.',
  },
  [POOL_IDS.REFERRAL]: {
    name: 'Referral Pool',
    description: '10% of spending. Funds L1 (8%) and L2 (2%) referral rewards.',
  },
  [POOL_IDS.WHEEL]: {
    name: 'Wheel of Fortune',
    description: '5% of spending. Prize pool for daily wheel spins.',
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TreasuryResponse>
) {
  // Verify admin token
  const adminToken = req.headers['x-admin-token'];
  if (adminToken !== process.env.ADMIN_PANEL_TOKEN) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  // ============================================
  // GET: Fetch all pool balances
  // ============================================
  if (req.method === 'GET') {
    try {
      const poolIds = Object.values(POOL_IDS);
      const pools: PoolInfo[] = [];
      let totalMyst = 0;

      for (const poolId of poolIds) {
        const balance = await getPoolBalance(prisma, poolId);
        const metadata = POOL_METADATA[poolId] || { 
          name: poolId, 
          description: 'Unknown pool' 
        };

        pools.push({
          id: poolId,
          name: metadata.name,
          balance,
          description: metadata.description,
        });

        totalMyst += balance;
      }

      // Also check legacy WheelPool
      try {
        const legacyWheel = await prisma.wheelPool.findUnique({
          where: { id: 'main_pool' },
        });
        if (legacyWheel && legacyWheel.balance > 0) {
          // Find wheel pool and add legacy balance info
          const wheelPool = pools.find(p => p.id === POOL_IDS.WHEEL);
          if (wheelPool) {
            wheelPool.balance += legacyWheel.balance;
            totalMyst += legacyWheel.balance;
          }
        }
      } catch (e) {
        // Legacy table might not exist
      }

      return res.status(200).json({
        ok: true,
        pools,
        totalMyst,
      });

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AdminTreasury] GET failed:', message);
      return res.status(500).json({ ok: false, message: 'Failed to fetch pools' });
    }
  }

  // ============================================
  // POST: Transfer between pools
  // ============================================
  if (req.method === 'POST') {
    try {
      const { fromPool, toPool, amount } = req.body as {
        fromPool?: string;
        toPool?: string;
        amount?: number;
      };

      // Validate inputs
      if (!fromPool || !toPool || !amount) {
        return res.status(400).json({ 
          ok: false, 
          message: 'Missing required fields: fromPool, toPool, amount' 
        });
      }

      if (amount <= 0) {
        return res.status(400).json({ ok: false, message: 'Amount must be positive' });
      }

      if (fromPool === toPool) {
        return res.status(400).json({ ok: false, message: 'Cannot transfer to same pool' });
      }

      // Get current balance of source pool
      const fromBalance = await getPoolBalance(prisma, fromPool);
      if (fromBalance < amount) {
        return res.status(400).json({ 
          ok: false, 
          message: `Insufficient balance in ${fromPool}. Available: ${fromBalance.toFixed(2)} MYST` 
        });
      }

      // Perform transfer
      await updatePoolBalance(prisma, fromPool, -amount);
      await updatePoolBalance(prisma, toPool, amount);

      // Get new balances
      const newFromBalance = await getPoolBalance(prisma, fromPool);
      const newToBalance = await getPoolBalance(prisma, toPool);

      console.log(`[AdminTreasury] Transfer: ${amount} MYST from ${fromPool} to ${toPool}`);

      return res.status(200).json({
        ok: true,
        transfer: {
          from: fromPool,
          to: toPool,
          amount,
          newFromBalance,
          newToBalance,
        },
        message: `Transferred ${amount} MYST from ${fromPool} to ${toPool}`,
      });

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AdminTreasury] POST failed:', message);
      return res.status(500).json({ ok: false, message: 'Transfer failed' });
    }
  }

  return res.status(405).json({ ok: false, message: 'Method not allowed' });
}

