/**
 * MYST Withdrawal Request API
 * 
 * POST /api/myst/withdraw
 * 
 * Creates a withdrawal request (Model A - manual payout by admin).
 * Does NOT send TON automatically - just prepares accounting.
 * 
 * Fee: 2% retained
 * Minimum: $50 USD net value
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { 
  createWithdrawalRequest,
  getMystBalance,
  MYST_CONFIG,
  USD_PER_MYST,
  getTonPriceUsd,
} from '../../../lib/myst-service';

interface WithdrawResponse {
  ok: boolean;
  withdrawalId?: string;
  mystRequested?: number;
  mystFee?: number;
  mystBurn?: number;
  usdNet?: number;
  tonAmount?: number;
  tonPriceUsd?: number;
  newBalance?: number;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithdrawResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await getUserFromRequest(req, prisma);
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    // Get user with TON address
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { tonAddress: true },
    });

    if (!fullUser?.tonAddress) {
      return res.status(400).json({ 
        ok: false, 
        message: 'Please connect your TON wallet first' 
      });
    }

    const { amountMyst } = req.body as { amountMyst?: number };

    if (!amountMyst || typeof amountMyst !== 'number' || amountMyst <= 0) {
      return res.status(400).json({ ok: false, message: 'Invalid amount' });
    }

    // Calculate preview
    const feeMyst = amountMyst * MYST_CONFIG.WITHDRAWAL_FEE_RATE;
    const burnMyst = amountMyst - feeMyst;
    const usdNet = burnMyst * USD_PER_MYST;

    // Check minimum before proceeding
    if (usdNet < MYST_CONFIG.WITHDRAWAL_MIN_USD) {
      const minMyst = Math.ceil(MYST_CONFIG.WITHDRAWAL_MIN_USD / USD_PER_MYST / (1 - MYST_CONFIG.WITHDRAWAL_FEE_RATE));
      return res.status(400).json({ 
        ok: false, 
        message: `Minimum withdrawal is $${MYST_CONFIG.WITHDRAWAL_MIN_USD} (${minMyst} MYST). Your request: $${usdNet.toFixed(2)}` 
      });
    }

    // Create withdrawal
    const result = await createWithdrawalRequest(prisma, user.id, amountMyst);

    if (!result.success) {
      return res.status(400).json({ ok: false, message: result.error });
    }

    // Get updated balance
    const newBalance = await getMystBalance(prisma, user.id);

    return res.status(200).json({
      ok: true,
      withdrawalId: result.withdrawalId,
      mystRequested: amountMyst,
      mystFee: result.mystFee,
      mystBurn: result.mystBurn,
      usdNet: result.usdNet,
      tonAmount: result.tonAmount,
      tonPriceUsd: getTonPriceUsd(),
      newBalance,
      message: `Withdrawal request created. ${result.tonAmount?.toFixed(4)} TON will be sent to your wallet.`,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MystService] withdraw failed:', message);
    return res.status(500).json({ ok: false, message: 'Failed to create withdrawal' });
  }
}

