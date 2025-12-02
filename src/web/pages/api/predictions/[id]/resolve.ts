/**
 * Resolve Prediction API
 *
 * POST: Resolve a prediction (admin only)
 * Distributes pot to winners using proper pool math.
 * 
 * ECONOMIC MODEL:
 * - Platform fee = 10% of the LOSING SIDE only (NOT total pool)
 * - Winners receive: (total pool - fee) distributed proportionally
 * - Fee split: 15% leaderboard, 10% referral, 5% wheel, 70% treasury
 * 
 * Example with YES=4000, NO=6000 (NO wins):
 * - Losing side = 4000 MYST (YES lost)
 * - Fee = 10% * 4000 = 400 MYST
 * - Winners receive: 10000 - 400 = 9600 MYST
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../../lib/prisma';
import { getTelegramUserFromRequest } from '../../../../lib/telegram-auth';
import { MYST_CONFIG, POOL_IDS } from '../../../../lib/myst-service';
import { z } from 'zod';

// Fee rate: 10% of losing side
const PLATFORM_FEE_RATE = 0.10;

// Fee distribution splits (must sum to 1.0)
const FEE_SPLIT = {
  LEADERBOARD: 0.15,  // 15%
  REFERRAL: 0.10,     // 10%
  WHEEL: 0.05,        // 5%
  TREASURY: 0.70,     // 70%
};

const resolvePredictionSchema = z.object({
  winningOption: z.string(), // The winning option string (e.g., "Yes" or "No")
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const telegramUser = getTelegramUserFromRequest(req);

    if (!telegramUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is admin
    const adminId = process.env.ADMIN_TELEGRAM_ID;
    if (!adminId || telegramUser.id.toString() !== adminId) {
      return res.status(403).json({ error: 'Forbidden - Admin only' });
    }

    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Prediction ID is required' });
    }

    const validation = resolvePredictionSchema.safeParse(req.body);

    if (!validation.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request data', details: validation.error.errors });
    }

    // Get prediction with retry
    const prediction = await withDbRetry(() => prisma.prediction.findUnique({
      where: { id },
      include: {
        bets: true,
      },
    }));

    if (!prediction) {
      return res.status(404).json({ error: 'Prediction not found' });
    }

    if (prediction.resolved) {
      return res.status(400).json({ error: 'Prediction is already resolved' });
    }

    // Check winner option is valid
    if (!prediction.options.includes(validation.data.winningOption)) {
      return res.status(400).json({ error: 'Invalid winning option' });
    }

    // Determine winning side (Yes = index 0, No = index 1)
    const winningOptionIndex = prediction.options.indexOf(validation.data.winningOption);
    const isYesWinner = winningOptionIndex === 0;

    // Get winning and losing pools
    const winningSideTotal = isYesWinner ? prediction.mystPoolYes : prediction.mystPoolNo;
    const losingSideTotal = isYesWinner ? prediction.mystPoolNo : prediction.mystPoolYes;
    const totalPool = winningSideTotal + losingSideTotal;

    // Get winning bets
    const winningBets = prediction.bets.filter(
      (bet) => bet.option === validation.data.winningOption
    );

    // ============================================
    // ECONOMIC MODEL: Fee = 10% of LOSING SIDE only
    // ============================================
    const platformFee = losingSideTotal * PLATFORM_FEE_RATE;
    const winPool = totalPool - platformFee;

    // Calculate fee distribution
    const feeToLeaderboard = platformFee * FEE_SPLIT.LEADERBOARD;
    const feeToReferral = platformFee * FEE_SPLIT.REFERRAL;
    const feeToWheel = platformFee * FEE_SPLIT.WHEEL;
    const feeToTreasury = platformFee * FEE_SPLIT.TREASURY;

    // Legacy payout calculation for points-based bets
    const houseFee = Math.floor(prediction.pot * 0.05);
    const legacyPayoutPot = prediction.pot - houseFee;

    const totalLegacyWinningBets = winningBets.reduce(
      (sum, bet) => sum + (bet.starsBet || bet.pointsBet),
      0
    );

    // Resolve prediction and distribute winnings
    // Use withDbRetry for transaction resilience
    await withDbRetry(async () => {
      return await prisma.$transaction(async (tx) => {
      // Mark prediction as resolved
      await tx.prediction.update({
        where: { id },
        data: {
          resolved: true,
          winningOption: validation.data.winningOption,
          resolvedAt: new Date(),
          status: 'RESOLVED',
        },
      });

      // Process MYST payouts to winners
      if (winningBets.length > 0 && winningSideTotal > 0) {
        for (const bet of winningBets) {
          // MYST payout
          if (bet.mystBet > 0) {
            // Calculate payout: user_stake * (win_pool / winning_side_total)
            const payoutPerMyst = winPool / winningSideTotal;
            const payout = bet.mystBet * payoutPerMyst;

            if (payout > 0) {
              // Credit MYST payout via transaction
              await tx.mystTransaction.create({
                data: {
                  userId: bet.userId,
                  type: 'prediction_win',
                  amount: payout,
                  meta: { 
                    predictionId: prediction.id,
                    betId: bet.id,
                    userStake: bet.mystBet,
                    winPool,
                    winningSideTotal,
                    payoutPerMyst,
                  },
                },
              });

              // Update bet with payout amount
              await tx.bet.update({
                where: { id: bet.id },
                data: { mystPayout: payout },
              });
            }
          }

          // Legacy points payout
          if ((bet.starsBet > 0 || bet.pointsBet > 0) && totalLegacyWinningBets > 0) {
            const betAmount = bet.starsBet || bet.pointsBet;
            const share = (betAmount / totalLegacyWinningBets) * legacyPayoutPot;
            const payout = Math.floor(share);

            if (payout > 0) {
              await tx.user.update({
                where: { id: bet.userId },
                data: {
                  points: {
                    increment: payout,
                  },
                },
              });
            }
          }
        }
      }

      // ============================================
      // Distribute platform fee to pools
      // ============================================
      if (platformFee > 0) {
        // Leaderboard pool: 15%
        await tx.poolBalance.upsert({
          where: { id: POOL_IDS.LEADERBOARD },
          update: { balance: { increment: feeToLeaderboard } },
          create: { id: POOL_IDS.LEADERBOARD, balance: feeToLeaderboard },
        });

        // Referral pool: 10%
        await tx.poolBalance.upsert({
          where: { id: POOL_IDS.REFERRAL },
          update: { balance: { increment: feeToReferral } },
          create: { id: POOL_IDS.REFERRAL, balance: feeToReferral },
        });

        // Wheel pool: 5%
        await tx.poolBalance.upsert({
          where: { id: POOL_IDS.WHEEL },
          update: { balance: { increment: feeToWheel } },
          create: { id: POOL_IDS.WHEEL, balance: feeToWheel },
        });

        // Also update legacy WheelPool
        await tx.wheelPool.upsert({
          where: { id: 'main_pool' },
          update: { balance: { increment: feeToWheel } },
          create: { id: 'main_pool', balance: feeToWheel },
        });

        // Treasury: 70%
        await tx.poolBalance.upsert({
          where: { id: POOL_IDS.TREASURY },
          update: { balance: { increment: feeToTreasury } },
          create: { id: POOL_IDS.TREASURY, balance: feeToTreasury },
        });
      }
      }, {
        maxWait: 15000, // 15 seconds max wait for large transactions
        timeout: 60000, // 60 seconds timeout for resolution
      });
    });

    console.log(
      `[Resolve] Prediction ${id} resolved. Winner: ${validation.data.winningOption}. ` +
      `MYST Pools: YES=${prediction.mystPoolYes}, NO=${prediction.mystPoolNo}, Total=${totalPool}. ` +
      `Losing side=${losingSideTotal}, Fee=${platformFee.toFixed(2)} (10% of losing side). ` +
      `Fee distribution: LB=${feeToLeaderboard.toFixed(2)}, REF=${feeToReferral.toFixed(2)}, ` +
      `WHEEL=${feeToWheel.toFixed(2)}, TREASURY=${feeToTreasury.toFixed(2)}. ` +
      `Winners=${winningBets.length}, WinPool=${winPool.toFixed(2)}`
    );

    return res.status(200).json({
      success: true,
      message: `Prediction resolved. Winner: ${validation.data.winningOption}`,
      economicModel: {
        totalPool,
        winningSide: isYesWinner ? 'YES' : 'NO',
        winningSideTotal,
        losingSide: isYesWinner ? 'NO' : 'YES',
        losingSideTotal,
        platformFee,
        platformFeePercent: '10% of losing side',
        feeDistribution: {
          leaderboard: feeToLeaderboard,
          referral: feeToReferral,
          wheel: feeToWheel,
          treasury: feeToTreasury,
        },
        winPool,
        winners: winningBets.length,
      },
      legacyPayoutPot,
    });
  } catch (error: any) {
    console.error('Resolve prediction API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message }),
    });
  }
}
