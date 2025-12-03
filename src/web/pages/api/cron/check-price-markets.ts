/**
 * Check Price-Based Crypto Markets Cron Job
 *
 * For price barrier markets like:
 *   "Will AVICI trade above $6.8 in 24 hours?"
 *
 * When the live price from CoinGecko meets or exceeds the strike price
 * BEFORE the 24h window ends, this cron will "close" the market early by:
 *   - Setting endsAt = now (so no new bets can be placed)
 *   - Optionally updating status to "PAUSED" to make the state explicit
 *
 * NOTE:
 * - This does NOT resolve the market or distribute winnings. Resolution
 *   still happens via the existing admin resolve endpoint.
 * - This focuses on auto-created TRENDING_CRYPTO and MEME_COIN markets
 *   whose titles follow the pattern:
 *     "Will {SYMBOL} trade above ${PRICE} in 24 hours?"
 *
 * Security: Requires CRON_SECRET in Authorization header or query param.
 *
 * Usage: Call this endpoint every 1–5 minutes from an external cron service.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../lib/prisma';
import { getTrendingCoinsWithPrices } from '../../../services/coingecko';
import { getTopPumpFunMemecoins } from '../../../services/memecoinRadar';
import { POOL_IDS } from '../../../lib/myst-service';

type CheckPriceMarketsResponse = {
  ok: boolean;
  checked: number;
  closed: number;
  skippedNoMatch: number;
  skippedNoPrice: number;
  error?: string;
};

// Fee rate and splits should mirror the main resolve endpoint
const PLATFORM_FEE_RATE = 0.1;
const FEE_SPLIT = {
  LEADERBOARD: 0.15,
  REFERRAL: 0.1,
  WHEEL: 0.05,
  TREASURY: 0.7,
};

// Regex to extract symbol and strike price from our auto-generated titles
// Example: "Will AVICI trade above $6.8 in 24 hours?"
const TITLE_REGEX =
  /Will\s+([A-Za-z0-9]+)\s+trade\s+above\s+\$([0-9.]+)\s+in\s+24\s*hours\?/i;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CheckPriceMarketsResponse>
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      checked: 0,
      closed: 0,
      skippedNoMatch: 0,
      skippedNoPrice: 0,
      error: 'Method not allowed',
    });
  }

  // Security: Check CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[CheckPriceMarkets] CRON_SECRET not set in environment');
    return res.status(500).json({
      ok: false,
      checked: 0,
      closed: 0,
      skippedNoMatch: 0,
      skippedNoPrice: 0,
      error: 'Cron secret not configured',
    });
  }

  // Check secret from header or query param
  const providedSecret =
    req.headers.authorization?.toString().replace('Bearer ', '') ||
    (req.headers['x-cron-secret'] as string | undefined) ||
    (req.query.secret as string | undefined);

  if (providedSecret !== cronSecret) {
    return res.status(401).json({
      ok: false,
      checked: 0,
      closed: 0,
      skippedNoMatch: 0,
      skippedNoPrice: 0,
      error: 'Unauthorized',
    });
  }

  try {
    const now = new Date();

    // Load active, unresolved price-based predictions for crypto / meme coins
    const predictions = await withDbRetry(() =>
      prisma.prediction.findMany({
        where: {
          status: 'ACTIVE',
          resolved: false,
          endsAt: {
            gt: now, // Only markets that are still within their 24h window
          },
          category: {
            in: ['TRENDING_CRYPTO', 'MEME_COIN'],
          },
        },
        include: {
          bets: true,
        },
      })
    );

    if (predictions.length === 0) {
      return res.status(200).json({
        ok: true,
        checked: 0,
        closed: 0,
        skippedNoMatch: 0,
        skippedNoPrice: 0,
      });
    }

    // Build a price map keyed by SYMBOL (uppercased)
    const priceBySymbol = new Map<string, number>();

    // 1) Pump.fun memecoins (MEME_COIN category)
    try {
      const memecoins = await getTopPumpFunMemecoins(50);
      for (const coin of memecoins) {
        if (!coin.symbol || typeof coin.priceUsd !== 'number') continue;
        priceBySymbol.set(coin.symbol.toUpperCase(), coin.priceUsd);
      }
    } catch (err) {
      console.error('[CheckPriceMarkets] Error loading Pump.fun memecoins:', err);
    }

    // 2) Trending coins with prices (TRENDING_CRYPTO category)
    try {
      const trending = await getTrendingCoinsWithPrices();
      for (const coin of trending) {
        if (!coin.symbol || typeof coin.priceUsd !== 'number') continue;
        priceBySymbol.set(coin.symbol.toUpperCase(), coin.priceUsd);
      }
    } catch (err) {
      console.error('[CheckPriceMarkets] Error loading trending coins:', err);
    }

    let checked = 0;
    let closed = 0;
    let skippedNoMatch = 0;
    let skippedNoPrice = 0;

    for (const prediction of predictions) {
      checked += 1;

      const match = prediction.title.match(TITLE_REGEX);
      if (!match) {
        skippedNoMatch += 1;
        continue;
      }

      const symbol = match[1].toUpperCase();
      const strike = parseFloat(match[2]);
      if (!symbol || Number.isNaN(strike)) {
        skippedNoMatch += 1;
        continue;
      }

      const currentPrice = priceBySymbol.get(symbol);
      if (typeof currentPrice !== 'number') {
        skippedNoPrice += 1;
        continue;
      }

      // If the live price meets or exceeds the strike, close and resolve the market early
      if (currentPrice >= strike) {
        try {
          // Determine winning option: for these markets, \"Yes\" (index 0) wins when price >= strike
          const winningOption = Array.isArray(prediction.options) && prediction.options.length > 0
            ? (prediction.options[0] as string)
            : 'Yes';

          const isYesWinner = winningOption === (prediction.options[0] as string);

          const winningSideTotal = isYesWinner ? prediction.mystPoolYes : prediction.mystPoolNo;
          const losingSideTotal = isYesWinner ? prediction.mystPoolNo : prediction.mystPoolYes;
          const totalPool = winningSideTotal + losingSideTotal;

          const winningBets = prediction.bets.filter((bet) => bet.option === winningOption);

          const platformFee = losingSideTotal * PLATFORM_FEE_RATE;
          const winPool = totalPool - platformFee;

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

          await withDbRetry(async () => {
            return prisma.$transaction(async (tx) => {
              // Mark prediction as resolved and close it immediately
              await tx.prediction.update({
                where: { id: prediction.id },
                data: {
                  resolved: true,
                  winningOption,
                  resolvedAt: now,
                  status: 'RESOLVED',
                  endsAt: now,
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
          });

          closed += 1;
          console.log(
            `[CheckPriceMarkets] Closed & resolved market for ${symbol}: current=${currentPrice}, strike=${strike}, id=${prediction.id}`
          );
        } catch (err) {
          console.error(
            `[CheckPriceMarkets] Failed to close & resolve market for ${symbol} (id=${prediction.id}):`,
            err
          );
        }
      }
    }

    return res.status(200).json({
      ok: true,
      checked,
      closed,
      skippedNoMatch,
      skippedNoPrice,
    });
  } catch (error: any) {
    console.error('[CheckPriceMarkets] Fatal error:', error);
    return res.status(500).json({
      ok: false,
      checked: 0,
      closed: 0,
      skippedNoMatch: 0,
      skippedNoPrice: 0,
      error: error?.message || 'Internal server error',
    });
  }
}


