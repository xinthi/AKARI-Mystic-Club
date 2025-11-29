/**
 * MYST Withdrawal Request API
 * 
 * POST /api/myst/withdraw
 * 
 * Creates a withdrawal request (Model A - manual payout by admin).
 * Does NOT send TON automatically - just prepares accounting.
 * 
 * Uses live TON/USD price from price oracle.
 * 
 * Fee: 2% retained
 * Minimum: $50 USD net value
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { 
  getMystBalance,
  MYST_CONFIG,
  USD_PER_MYST,
  POOL_IDS,
} from '../../../lib/myst-service';
import { getTonPriceUsd } from '../../../lib/myst-price';

interface WithdrawResponse {
  ok: boolean;
  withdrawalId?: string;
  mystRequested?: number;
  mystFee?: number;
  mystBurn?: number;
  usdNet?: number;
  tonAmount?: number;
  tonPriceUsd?: number;
  priceSource?: string;
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

    // Check balance
    const balance = await getMystBalance(prisma, user.id);
    if (balance < amountMyst) {
      return res.status(400).json({ 
        ok: false, 
        message: `Insufficient balance. Have: ${balance.toFixed(2)}, Need: ${amountMyst.toFixed(2)}` 
      });
    }

    // Get live TON price
    const { priceUsd: tonPriceUsd, source: priceSource } = await getTonPriceUsd();

    // Calculate amounts
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

    // Calculate TON amount using live price
    const tonAmount = usdNet / tonPriceUsd;

    // Create withdrawal in transaction
    const withdrawal = await prisma.$transaction(async (tx) => {
      // Debit user
      await tx.mystTransaction.create({
        data: {
          userId: user.id,
          type: 'withdraw_request',
          amount: -amountMyst,
          meta: JSON.parse(JSON.stringify({ 
            purpose: 'withdrawal',
            tonPriceUsd,
            priceSource,
          })),
        },
      });

      // Credit fee to treasury
      await tx.poolBalance.upsert({
        where: { id: POOL_IDS.TREASURY },
        update: { balance: { increment: feeMyst } },
        create: { id: POOL_IDS.TREASURY, balance: feeMyst },
      });

      // Create withdrawal request with live price stored
      const req = await tx.withdrawalRequest.create({
        data: {
          userId: user.id,
          tonAddress: fullUser.tonAddress!,
          mystRequested: amountMyst,
          mystFee: feeMyst,
          mystBurn: burnMyst,
          usdNet,
          tonAmount,
          tonPriceUsd, // Store the price used at time of request
          status: 'pending',
        },
      });

      return req;
    });

    // Get updated balance
    const newBalance = await getMystBalance(prisma, user.id);

    console.log(`[Withdraw] Created request ${withdrawal.id}: ${amountMyst} MYST → ${tonAmount.toFixed(4)} TON @ $${tonPriceUsd.toFixed(2)}/TON`);

    return res.status(200).json({
      ok: true,
      withdrawalId: withdrawal.id,
      mystRequested: amountMyst,
      mystFee: feeMyst,
      mystBurn: burnMyst,
      usdNet,
      tonAmount,
      tonPriceUsd,
      priceSource,
      newBalance,
      message: `Withdrawal request created. ${tonAmount.toFixed(4)} TON will be sent to your wallet.`,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Withdraw] Failed:', message);
    return res.status(500).json({ ok: false, message: 'Failed to create withdrawal' });
  }
}
