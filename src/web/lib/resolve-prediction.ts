/**
 * Shared helper function to resolve a prediction and distribute winnings
 * Used by both admin resolve endpoint and auto-resolution cron jobs
 */

import { PrismaClient } from '@prisma/client';
import { POOL_IDS } from './myst-service';

// Fee rate: 10% of losing side
const PLATFORM_FEE_RATE = 0.1;

// Fee distribution splits (must sum to 1.0)
const FEE_SPLIT = {
  LEADERBOARD: 0.15,  // 15%
  REFERRAL: 0.1,      // 10%
  WHEEL: 0.05,        // 5%
  TREASURY: 0.7,      // 70%
};

export interface ResolvePredictionParams {
  prisma: PrismaClient;
  predictionId: string;
  winningOption: string;
  now: Date;
}

export async function resolvePredictionById({
  prisma,
  predictionId,
  winningOption,
  now,
}: ResolvePredictionParams): Promise<{ success: boolean; error?: string }> {
  try {
    // Get prediction with bets
    const prediction = await prisma.prediction.findUnique({
      where: { id: predictionId },
      include: { bets: true },
    });

    if (!prediction) {
      return { success: false, error: 'Prediction not found' };
    }

    if (prediction.resolved) {
      return { success: false, error: 'Prediction is already resolved' };
    }

    // Check winner option is valid
    if (!prediction.options.includes(winningOption)) {
      return { success: false, error: 'Invalid winning option' };
    }

    // Determine winning side (Yes = index 0, No = index 1)
    const winningOptionIndex = prediction.options.indexOf(winningOption);
    const isYesWinner = winningOptionIndex === 0;

    // Get winning and losing pools
    const winningSideTotal = isYesWinner ? prediction.mystPoolYes : prediction.mystPoolNo;
    const losingSideTotal = isYesWinner ? prediction.mystPoolNo : prediction.mystPoolYes;
    const totalPool = winningSideTotal + losingSideTotal;

    // Get winning bets
    const winningBets = prediction.bets.filter((bet) => bet.option === winningOption);

    // Calculate platform fee (10% of losing side)
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

    // Resolve prediction and distribute winnings in a transaction
    await prisma.$transaction(async (tx) => {
      // Mark prediction as resolved
      await tx.prediction.update({
        where: { id: predictionId },
        data: {
          resolved: true,
          winningOption,
          resolvedAt: now,
          status: 'RESOLVED',
          endsAt: now, // Close the market
        },
      });

      // MYST payouts to winners
      if (winningBets.length > 0 && winningSideTotal > 0) {
        const payoutPerMyst = winPool / winningSideTotal;

        for (const bet of winningBets) {
          if (bet.mystBet > 0) {
            const payout = bet.mystBet * payoutPerMyst;
            if (payout > 0) {
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

              await tx.bet.update({
                where: { id: bet.id },
                data: { mystPayout: payout },
              });
            }
          }

          // Legacy points payout
          if (
            (bet.starsBet > 0 || bet.pointsBet > 0) &&
            totalLegacyWinningBets > 0 &&
            legacyPayoutPot > 0
          ) {
            const betAmount = bet.starsBet || bet.pointsBet;
            const share = (betAmount / totalLegacyWinningBets) * legacyPayoutPot;
            const payoutPoints = Math.floor(share);

            if (payoutPoints > 0) {
              await tx.user.update({
                where: { id: bet.userId },
                data: {
                  points: {
                    increment: payoutPoints,
                  },
                },
              });
            }
          }
        }
      }

      // Distribute platform fee to pools
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
    });

    return { success: true };
  } catch (error: any) {
    console.error(`[resolvePredictionById] Error resolving prediction ${predictionId}:`, error);
    return { success: false, error: error?.message || 'Failed to resolve prediction' };
  }
}

