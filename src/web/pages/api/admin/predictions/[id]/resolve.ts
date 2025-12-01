/**
 * Admin Resolve Prediction API
 * 
 * POST: Resolve a prediction and pay out winners
 * 
 * ECONOMIC MODEL:
 * - Platform fee = 10% of the LOSING SIDE only (NOT total pool)
 * - Winners receive: (total pool - fee) distributed proportionally
 * - Fee distribution:
 *   - 10% of platform fee → Referral leaderboard (weekly distribution)
 *   - 15% of platform fee → Leaderboard pool
 *   - 5% of platform fee → Wheel pool
 *   - 70% of platform fee → Treasury
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../../lib/prisma';
import { POOL_IDS } from '../../../../../lib/myst-service';

// Fee rate: 10% of losing side
const PLATFORM_FEE_RATE = 0.10;

// Fee distribution splits (must sum to 1.0)
const FEE_SPLIT = {
  REFERRAL_LEADERBOARD: 0.10,  // 10% of platform fee → referral leaderboard
  LEADERBOARD: 0.15,           // 15% of platform fee → leaderboard pool
  WHEEL: 0.05,                 // 5% of platform fee → wheel pool
  TREASURY: 0.70,              // 70% of platform fee → treasury
};

interface ResolveResponse {
  ok: boolean;
  winnersCount?: number;
  totalPayout?: number;
  economicModel?: {
    totalPool: number;
    winningSide: string;
    losingSide: string;
    platformFee: number;
    feeDistribution: {
      referralLeaderboard: number;
      leaderboard: number;
      wheel: number;
      treasury: number;
    };
    winPool: number;
  };
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResolveResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, message: 'Invalid prediction ID' });
  }

  // Verify admin token
  const adminToken = req.headers['x-admin-token'];
  if (adminToken !== process.env.ADMIN_PANEL_TOKEN) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  const { winningOption } = req.body;
  if (typeof winningOption !== 'number') {
    return res.status(400).json({ ok: false, message: 'winningOption is required' });
  }

  try {
    // Get prediction with all bets
    const prediction = await prisma.prediction.findUnique({
      where: { id },
      include: {
        bets: true,
      },
    });

    if (!prediction) {
      return res.status(404).json({ ok: false, message: 'Prediction not found' });
    }

    if (prediction.status === 'RESOLVED') {
      return res.status(400).json({ ok: false, message: 'Prediction already resolved' });
    }

    if (winningOption < 0 || winningOption >= prediction.options.length) {
      return res.status(400).json({ ok: false, message: 'Invalid winning option index' });
    }

    const winningOptionString = prediction.options[winningOption];
    const isYesWinner = winningOption === 0;

    // Get pool totals
    const winningSideTotal = isYesWinner ? prediction.mystPoolYes : prediction.mystPoolNo;
    const losingSideTotal = isYesWinner ? prediction.mystPoolNo : prediction.mystPoolYes;
    const totalPool = winningSideTotal + losingSideTotal;

    // ECONOMIC MODEL: Fee = 10% of LOSING SIDE only
    const platformFee = losingSideTotal * PLATFORM_FEE_RATE;
    const winPool = totalPool - platformFee;

    // Calculate fee distribution
    const feeToReferralLeaderboard = platformFee * FEE_SPLIT.REFERRAL_LEADERBOARD;
    const feeToLeaderboard = platformFee * FEE_SPLIT.LEADERBOARD;
    const feeToWheel = platformFee * FEE_SPLIT.WHEEL;
    const feeToTreasury = platformFee * FEE_SPLIT.TREASURY;

    // Get winning bets
    const winningBets = prediction.bets.filter(bet => bet.option === winningOptionString);

    // Process payouts in a transaction
    const result = await prisma.$transaction(async (tx) => {
      let winnersCount = 0;
      let totalPayout = 0;

      // Pay out winners proportionally
      if (winningSideTotal > 0 && winningBets.length > 0) {
        for (const bet of winningBets) {
          const betAmount = bet.mystBet ?? 0;
          if (betAmount > 0) {
            // Calculate payout: user_stake * (win_pool / winning_side_total)
            const payoutPerMyst = winPool / winningSideTotal;
            const payout = betAmount * payoutPerMyst;

            // Credit user
            await tx.mystTransaction.create({
              data: {
                userId: bet.userId,
                type: 'prediction_win',
                amount: payout,
                meta: {
                  predictionId: prediction.id,
                  betId: bet.id,
                  userStake: betAmount,
                  payoutPerMyst,
                  winPool,
                  winningSideTotal,
                },
              },
            });

            // Update bet with payout
            await tx.bet.update({
              where: { id: bet.id },
              data: { mystPayout: payout },
            });

            winnersCount++;
            totalPayout += payout;
          }
        }
      }

      // If no winners, refund bets proportionally (minus platform fee)
      if (winningBets.length === 0 && prediction.bets.length > 0) {
        for (const bet of prediction.bets) {
          const betAmount = bet.mystBet ?? 0;
          if (betAmount > 0) {
            // Each bettor gets their share of winPool
            const refundAmount = betAmount * (winPool / totalPool);
            
            await tx.mystTransaction.create({
              data: {
                userId: bet.userId,
                type: 'prediction_refund',
                amount: refundAmount,
                meta: {
                  predictionId: prediction.id,
                  betId: bet.id,
                  reason: 'no_winners',
                },
              },
            });
          }
        }
      }

      // Distribute platform fee to pools
      if (platformFee > 0) {
        // Referral leaderboard: 10% of platform fee (weekly distribution)
        await tx.poolBalance.upsert({
          where: { id: POOL_IDS.REFERRAL },
          update: { balance: { increment: feeToReferralLeaderboard } },
          create: { id: POOL_IDS.REFERRAL, balance: feeToReferralLeaderboard },
        });

        // Leaderboard pool: 15% of platform fee
        await tx.poolBalance.upsert({
          where: { id: POOL_IDS.LEADERBOARD },
          update: { balance: { increment: feeToLeaderboard } },
          create: { id: POOL_IDS.LEADERBOARD, balance: feeToLeaderboard },
        });

        // Wheel pool: 5% of platform fee
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

        // Treasury: 70% of platform fee
        await tx.poolBalance.upsert({
          where: { id: POOL_IDS.TREASURY },
          update: { balance: { increment: feeToTreasury } },
          create: { id: POOL_IDS.TREASURY, balance: feeToTreasury },
        });
      }

      // Update prediction status
      await tx.prediction.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolved: true,
          winningOption: winningOptionString,
          resolvedAt: new Date(),
        },
      });

      return { winnersCount, totalPayout };
    });

    console.log(
      `[AdminPrediction] Resolved ${id}: Option ${winningOption} (${winningOptionString}). ` +
      `Pool: YES=${prediction.mystPoolYes}, NO=${prediction.mystPoolNo}, Total=${totalPool}. ` +
      `Losing side=${losingSideTotal}, Fee=${platformFee.toFixed(2)} (10% of losing). ` +
      `Fee dist: REF_LB=${feeToReferralLeaderboard.toFixed(2)}, LB=${feeToLeaderboard.toFixed(2)}, ` +
      `WHEEL=${feeToWheel.toFixed(2)}, TREASURY=${feeToTreasury.toFixed(2)}. ` +
      `${result.winnersCount} winners, ${result.totalPayout.toFixed(2)} MYST paid out`
    );

    return res.status(200).json({
      ok: true,
      winnersCount: result.winnersCount,
      totalPayout: result.totalPayout,
      economicModel: {
        totalPool,
        winningSide: isYesWinner ? 'YES' : 'NO',
        losingSide: isYesWinner ? 'NO' : 'YES',
        platformFee,
        feeDistribution: {
          referralLeaderboard: feeToReferralLeaderboard,
          leaderboard: feeToLeaderboard,
          wheel: feeToWheel,
          treasury: feeToTreasury,
        },
        winPool,
      },
      message: `Prediction resolved. ${result.winnersCount} winner(s) received ${result.totalPayout.toFixed(2)} MYST.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AdminPrediction] Resolve failed:', message);
    return res.status(500).json({ ok: false, message: 'Failed to resolve prediction' });
  }
}
