/**
 * MYST Demo Credit API
 * 
 * POST /api/myst/demo-credit
 * 
 * Grants a small amount of MYST for demo/testing purposes.
 * Limited to once per 24 hours per user.
 * 
 * This is NOT a production feature - it's for testing the MYST system
 * before real Telegram Stars integration.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { creditMyst, canClaimDemoCredit, getMystBalance } from '../../../lib/myst-service';

// Demo credit amount
const DEMO_CREDIT_AMOUNT = 10;

interface DemoCreditResponse {
  ok: boolean;
  mystGranted?: number;
  newBalance?: number;
  nextClaimAt?: string;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DemoCreditResponse>
) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      message: 'Method not allowed',
    });
  }

  // Check if demo credit is enabled via env flag
  if (process.env.MYST_DEMO_ENABLED !== 'true') {
    console.log('[/api/myst/demo-credit] Demo credit disabled (MYST_DEMO_ENABLED !== true)');
    return res.status(403).json({
      ok: false,
      message: 'Demo MYST credit is disabled.',
    });
  }

  try {
    // Authenticate user via Telegram initData
    const user = await getUserFromRequest(req, prisma);
    
    if (!user) {
      console.log('[/api/myst/demo-credit] No authenticated user');
      return res.status(401).json({
        ok: false,
        message: 'Please open this app from Telegram to use this feature',
      });
    }

    console.log(`[/api/myst/demo-credit] User ${user.id} requesting demo credit`);

    // Check if user can claim (24h cooldown)
    const { canClaim, nextClaimAt } = await canClaimDemoCredit(prisma, user.id);
    
    if (!canClaim) {
      console.log(`[/api/myst/demo-credit] User ${user.id} already claimed within 24h`);
      return res.status(200).json({
        ok: false,
        message: 'You already claimed your daily demo MYST. Come back later!',
        nextClaimAt: nextClaimAt?.toISOString(),
      });
    }

    // Credit the demo MYST
    const { credited, newBalance } = await creditMyst(
      prisma,
      user.id,
      DEMO_CREDIT_AMOUNT,
      'demo_credit',
      { source: 'demo', claimedAt: new Date().toISOString() }
    );

    console.log(`[/api/myst/demo-credit] Granted ${credited} MYST to user ${user.id}. New balance: ${newBalance}`);

    return res.status(200).json({
      ok: true,
      mystGranted: credited,
      newBalance,
      message: `You received ${credited} MYST!`,
    });

  } catch (error: any) {
    console.error('[/api/myst/demo-credit] Error:', error);
    return res.status(500).json({
      ok: false,
      message: 'Failed to grant demo MYST. Please try again.',
    });
  }
}

