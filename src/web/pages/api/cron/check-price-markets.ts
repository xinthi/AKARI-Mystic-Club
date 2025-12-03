/**
 * Check and Auto-Close Markets Cron Job
 *
 * This cron job automatically closes and resolves markets when:
 * 1. Crypto/Meme Coin: Price target is hit (e.g., AVICI >= $6.83)
 * 2. Sports: Match has finished (event has occurred)
 * 3. Any market: Outcome is determined before the end time
 *
 * For price-based markets:
 *   "Will AVICI trade above $6.8 in 24 hours?"
 *   - Tracks all coins with active predictions
 *   - Auto-resolves when price >= strike price
 *   - Distributes winnings immediately
 *
 * For sports markets:
 *   - Checks if match has finished
 *   - Closes market when event has occurred
 *
 * Security: Requires CRON_SECRET in Authorization header or query param.
 *
 * Usage: Call this endpoint every 1–2 minutes from an external cron service.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../lib/prisma';
import { getTrendingCoinsWithPrices, getPriceBySymbol } from '../../../services/coingecko';
import { getTopPumpFunMemecoins } from '../../../services/memecoinRadar';
import { POOL_IDS } from '../../../lib/myst-service';

type CheckPriceMarketsResponse = {
  ok: boolean;
  checked: number;
  closed: number;
  skippedNoMatch: number;
  skippedNoPrice: number;
  skippedSports?: number;
  priceMapSize?: number;
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
      skippedSports: 0,
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
      skippedSports: 0,
      error: 'Cron secret not configured',
    });
  }

  // Check secret from header or query param
  const providedSecret =
    req.headers.authorization?.replace('Bearer ', '') ||
    (req.headers['x-cron-secret'] as string | undefined) ||
    (req.query.secret as string | undefined);

  if (providedSecret !== cronSecret) {
    return res.status(401).json({
      ok: false,
      checked: 0,
      closed: 0,
      skippedNoMatch: 0,
      skippedNoPrice: 0,
      skippedSports: 0,
      error: 'Unauthorized',
    });
  }

  try {
    const now = new Date();

    // Load ALL active, unresolved predictions (not just crypto)
    // We check ALL categories to ensure no market stays open after outcome is determined
    const predictions = await withDbRetry(() =>
      prisma.prediction.findMany({
        where: {
          status: 'ACTIVE',
          resolved: false,
          // Don't filter by endsAt - we want to check ALL active markets
          // Even if past end time, we should still resolve if outcome is known
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
        skippedSports: 0,
      });
    }

    // Extract all unique symbols from active predictions
    const symbolsToTrack = new Set<string>();
    for (const prediction of predictions) {
      const match = prediction.title.match(TITLE_REGEX);
      if (match && match[1]) {
        symbolsToTrack.add(match[1].toUpperCase());
      }
    }

    console.log(`[CheckPriceMarkets] Tracking ${symbolsToTrack.size} unique symbols from active predictions:`, Array.from(symbolsToTrack));

    // Build a price map keyed by SYMBOL (uppercased)
    const priceBySymbol = new Map<string, number>();

    // Fetch prices for all symbols we're tracking
    const pricePromises = Array.from(symbolsToTrack).map(async (symbol) => {
      try {
        const price = await getPriceBySymbol(symbol);
        if (typeof price === 'number') {
          priceBySymbol.set(symbol, price);
          return { symbol, price, success: true };
        } else {
          console.warn(`[CheckPriceMarkets] Could not fetch price for ${symbol}`);
          return { symbol, price: null, success: false };
        }
      } catch (err) {
        console.error(`[CheckPriceMarkets] Error fetching price for ${symbol}:`, err);
        return { symbol, price: null, success: false };
      }
    });

    // Wait for all price fetches to complete (with some parallelism)
    const results = await Promise.all(pricePromises);
    const successful = results.filter(r => r.success).length;
    console.log(`[CheckPriceMarkets] Fetched prices for ${successful}/${symbolsToTrack.size} symbols`);

    let checked = 0;
    let closed = 0;
    let skippedNoMatch = 0;
    let skippedNoPrice = 0;
    let skippedSports = 0;

    for (const prediction of predictions) {
      checked += 1;
      const category = prediction.category || '';

      // Handle Crypto/Meme Coin price-based markets
      if (category === 'TRENDING_CRYPTO' || category === 'MEME_COIN') {
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
          console.log(`[CheckPriceMarkets] No price found for ${symbol} (strike: $${strike}) - prediction ${prediction.id}`);
          continue;
        }

        // If the live price meets or exceeds the strike, close and resolve the market early
        console.log(`[CheckPriceMarkets] Checking ${symbol}: current=$${currentPrice}, strike=$${strike}, prediction=${prediction.id}`);
        
        if (currentPrice >= strike) {
          console.log(`[CheckPriceMarkets] ✅ Price target hit! ${symbol} at $${currentPrice} >= $${strike}, resolving market ${prediction.id}`);
          try {
            // Determine winning option: for these markets, "Yes" (index 0) wins when price >= strike
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
        continue; // Move to next prediction after handling crypto/meme coin
      }

      // Handle Sports markets - check if match has finished
      if (category === 'SPORTS' || category === 'sports') {
        skippedSports += 1;
        // TODO: Add sports match checking logic
        // For now, sports markets need manual resolution or we need to store fixture IDs
        // This can be enhanced later when sports markets are created with fixture IDs
        console.log(`[CheckPriceMarkets] Sports market ${prediction.id} - manual resolution required for now`);
        continue;
      }

      // For other categories, check if endsAt has passed
      if (prediction.endsAt && new Date(prediction.endsAt) < now) {
        // Market has passed its end time but isn't resolved - close it
        console.log(`[CheckPriceMarkets] Market ${prediction.id} has passed end time, closing...`);
        try {
          await withDbRetry(() =>
            prisma.prediction.update({
              where: { id: prediction.id },
              data: {
                status: 'PAUSED', // Close betting
                endsAt: now,
              },
            })
          );
          closed += 1;
        } catch (err) {
          console.error(`[CheckPriceMarkets] Failed to close expired market ${prediction.id}:`, err);
        }
      }
    }

    console.log(
      `[CheckPriceMarkets] Summary: checked=${checked}, closed=${closed}, ` +
      `skippedNoMatch=${skippedNoMatch}, skippedNoPrice=${skippedNoPrice}, ` +
      `skippedSports=${skippedSports}, priceMapSize=${priceBySymbol.size}`
    );

    return res.status(200).json({
      ok: true,
      checked,
      closed,
      skippedNoMatch,
      skippedNoPrice,
      skippedSports,
      priceMapSize: priceBySymbol.size,
    });
  } catch (error: any) {
    console.error('[CheckPriceMarkets] Fatal error:', error);
    return res.status(500).json({
      ok: false,
      checked: 0,
      closed: 0,
      skippedNoMatch: 0,
      skippedNoPrice: 0,
      skippedSports: 0,
      error: error?.message || 'Internal server error',
    });
  }
}


