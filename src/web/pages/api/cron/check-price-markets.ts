/**
 * Auto-Resolution Cron for Price-Based Crypto Markets
 *
 * This cron job automatically resolves expired price-based prediction markets:
 * - MEME_COIN: Meme coin price predictions
 * - TRENDING_CRYPTO: Trending crypto price predictions
 * - CRYPTO: General crypto price predictions
 *
 * For price-based markets like:
 *   "Will AVICI trade above $6.83 in 24 hours?"
 *
 * When the market expires (endsAt < now), this cron:
 *   1. Fetches the current price from CoinGecko
 *   2. Compares it to the target price
 *   3. Resolves: "Yes" if currentPrice >= targetPrice, else "No"
 *   4. Distributes winnings to winners
 *
 * Security: Requires CRON_SECRET in Authorization header or query param.
 *
 * Usage: Call this endpoint every 1–2 minutes from an external cron service.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../lib/prisma';
import { getPriceBySymbol } from '../../../services/coingecko';
import { resolvePredictionById } from '../../../lib/resolve-prediction';

type CheckPriceMarketsResponse = {
  ok: boolean;
  resolved: number;
  errors: number;
  items: Array<{
    id: string;
    title: string;
    category: string;
    symbol: string;
    targetPrice: number;
    currentPrice: number;
    winningOption: 'Yes' | 'No';
  }>;
  error?: string;
};

// Regex to extract symbol and strike price from our auto-generated titles
// Example: "Will AVICI trade above $6.83 in 24 hours?"
const TITLE_REGEX =
  /Will\s+([A-Za-z0-9]+)\s+trade\s+above\s+\$([0-9.]+)\s+in\s+24\s*hours\?/i;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CheckPriceMarketsResponse>
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      resolved: 0,
      errors: 0,
      items: [],
      error: 'Method not allowed',
    });
  }

  // Security: Check CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[CheckPriceMarkets] CRON_SECRET not set in environment');
    return res.status(500).json({
      ok: false,
      resolved: 0,
      errors: 0,
      items: [],
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
      resolved: 0,
      errors: 0,
      items: [],
      error: 'Unauthorized',
    });
  }

  try {
    const now = new Date();

    // Load EXPIRED, unresolved price-based predictions
    // Only check crypto categories: MEME_COIN, TRENDING_CRYPTO, CRYPTO
    const predictions = await withDbRetry(() =>
      prisma.prediction.findMany({
        where: {
          status: 'ACTIVE',
          resolved: false,
          endsAt: {
            not: null,
            lt: now, // Only expired markets
          },
          category: {
            in: ['MEME_COIN', 'TRENDING_CRYPTO', 'CRYPTO'],
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
        resolved: 0,
        errors: 0,
        items: [],
      });
    }

    console.log(
      `[CheckPriceMarkets] Found ${predictions.length} expired price-based predictions to check`
    );

    const resolvedItems: CheckPriceMarketsResponse['items'] = [];
    let resolved = 0;
    let errors = 0;

    // Process each prediction
    for (const prediction of predictions) {
      const category = prediction.category || '';

      // Parse title to extract symbol and target price
      const match = prediction.title.match(TITLE_REGEX);
      if (!match || !match[1] || !match[2]) {
        console.log(
          `[CheckPriceMarkets] ⚠️ Prediction ${prediction.id} doesn't match title pattern: "${prediction.title}"`
        );
        errors += 1;
        continue;
      }

      const symbol = match[1].toUpperCase();
      const targetPrice = parseFloat(match[2]);

      if (!symbol || Number.isNaN(targetPrice)) {
        console.log(
          `[CheckPriceMarkets] ⚠️ Invalid symbol or price for prediction ${prediction.id}: symbol=${symbol}, price=${match[2]}`
        );
        errors += 1;
        continue;
      }

      // Fetch current price
      let currentPrice: number | null = null;
      try {
        currentPrice = await getPriceBySymbol(symbol);
      } catch (err) {
        console.error(
          `[CheckPriceMarkets] Error fetching price for ${symbol}:`,
          err
        );
        errors += 1;
        continue;
      }

      if (typeof currentPrice !== 'number') {
        console.log(
          `[CheckPriceMarkets] ⚠️ No price found for ${symbol} (target: $${targetPrice}) - prediction ${prediction.id}`
        );
        errors += 1;
        continue;
      }

      // Determine winning option
      // "Yes" wins if currentPrice >= targetPrice, else "No"
      const winningOption: 'Yes' | 'No' = currentPrice >= targetPrice ? 'Yes' : 'No';

      console.log(
        `[CheckPriceMarkets] 🔍 ${symbol}: current=$${currentPrice}, target=$${targetPrice}, winner=${winningOption}, prediction=${prediction.id}`
      );

      // Resolve the prediction using the shared helper
      const result = await withDbRetry(async () => {
        return resolvePredictionById({
          prisma,
          predictionId: prediction.id,
          winningOption,
          now,
        });
      });

      if (result.success) {
        resolved += 1;
        resolvedItems.push({
          id: prediction.id,
          title: prediction.title,
          category,
          symbol,
          targetPrice,
          currentPrice,
          winningOption,
        });
        console.log(
          `[CheckPriceMarkets] ✅ Resolved ${symbol} market: ${winningOption} (current=$${currentPrice}, target=$${targetPrice})`
        );
      } else {
        errors += 1;
        console.error(
          `[CheckPriceMarkets] ❌ Failed to resolve prediction ${prediction.id}: ${result.error}`
        );
      }
    }

    console.log(
      `[CheckPriceMarkets] Summary: resolved=${resolved}, errors=${errors}, total=${predictions.length}`
    );

    return res.status(200).json({
      ok: true,
      resolved,
      errors,
      items: resolvedItems,
    });
  } catch (error: any) {
    console.error('[CheckPriceMarkets] Fatal error:', error);
    return res.status(500).json({
      ok: false,
      resolved: 0,
      errors: 0,
      items: [],
      error: error?.message || 'Internal server error',
    });
  }
}
