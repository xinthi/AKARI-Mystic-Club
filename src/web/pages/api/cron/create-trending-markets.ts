/**
 * Auto-Create Trending Coin Markets Cron Job
 * 
 * Creates prediction markets for CoinGecko trending coins.
 * 
 * Security: Requires CRON_SECRET in Authorization header or query param.
 * 
 * Usage: Call this endpoint every 30-60 minutes from external cron service.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../lib/prisma';
import { getTrendingCoinsWithPrices } from '../../../services/coingecko';

interface CreateMarketsResponse {
  ok: boolean;
  created: number;
  skipped: number;
  errors: number;
  markets: Array<{
    id: string;
    title: string;
    coinSymbol: string;
  }>;
  error?: string;
}

// Default entry fee for trending coin markets
const DEFAULT_ENTRY_FEE_MYST = 50;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateMarketsResponse>
) {
  // Only allow GET or POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      created: 0,
      skipped: 0,
      errors: 0,
      markets: [],
      error: 'Method not allowed',
    });
  }

  // Security: Check CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[CreateTrendingMarkets] CRON_SECRET not set in environment');
    return res.status(500).json({
      ok: false,
      created: 0,
      skipped: 0,
      errors: 0,
      markets: [],
      error: 'Cron secret not configured',
    });
  }

  // Check secret from header or query param
  const providedSecret = 
    req.headers.authorization?.replace('Bearer ', '') ||
    req.headers['x-cron-secret'] ||
    req.query.secret;

  if (providedSecret !== cronSecret) {
    return res.status(401).json({
      ok: false,
      created: 0,
      skipped: 0,
      errors: 0,
      markets: [],
      error: 'Unauthorized',
    });
  }

  try {
    // Get trending coins with prices
    const trendingCoins = await getTrendingCoinsWithPrices();
    
    if (trendingCoins.length === 0) {
      return res.status(200).json({
        ok: true,
        created: 0,
        skipped: 0,
        errors: 0,
        markets: [],
      });
    }

    let created = 0;
    let skipped = 0;
    let errors = 0;
    const createdMarkets: Array<{ id: string; title: string; coinSymbol: string }> = [];

    // Process each coin
    for (const coin of trendingCoins) {
      try {
        // Build prediction title
        const price = Math.round(coin.priceUsd * 100) / 100; // Round to 2 decimals
        const title = `Will ${coin.symbol.toUpperCase()} trade above $${price} in 24 hours?`;

        // Check if prediction with this exact title already exists
        const existing = await withDbRetry(() => prisma.prediction.findFirst({
          where: { title },
          select: { id: true },
        }));

        if (existing) {
          skipped++;
          continue;
        }

        // Calculate endsAt (24 hours from now)
        const endsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        // Create new prediction
        const prediction = await withDbRetry(() => prisma.prediction.create({
          data: {
            title,
            description: `Predict if ${coin.name} (${coin.symbol.toUpperCase()}) will trade above $${price} USD within 24 hours.`,
            options: ['Yes', 'No'],
            entryFeeMyst: DEFAULT_ENTRY_FEE_MYST,
            status: 'ACTIVE',
            endsAt,
            category: 'TRENDING_CRYPTO',
            resolved: false,
            participantCount: 0,
            pot: 0,
            mystPoolYes: 0,
            mystPoolNo: 0,
          },
        }));

        created++;
        createdMarkets.push({
          id: prediction.id,
          title: prediction.title,
          coinSymbol: coin.symbol,
        });

        console.log(`[CreateTrendingMarkets] Created market: ${title}`);
      } catch (error: any) {
        console.error(`[CreateTrendingMarkets] Error creating market for ${coin.symbol}:`, error.message);
        errors++;
      }
    }

    return res.status(200).json({
      ok: true,
      created,
      skipped,
      errors,
      markets: createdMarkets,
    });
  } catch (error: any) {
    console.error('[CreateTrendingMarkets] Fatal error:', error);
    return res.status(500).json({
      ok: false,
      created: 0,
      skipped: 0,
      errors: 0,
      markets: [],
      error: error.message || 'Internal server error',
    });
  }
}

