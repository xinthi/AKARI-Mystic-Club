/**
 * Debug endpoint to check AVICI price and market status
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../lib/prisma';
import { getPriceBySymbol } from '../../../services/coingecko';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Find AVICI prediction
    const aviciPrediction = await withDbRetry(() =>
      prisma.prediction.findFirst({
        where: {
          title: {
            contains: 'AVICI',
            mode: 'insensitive',
          },
          resolved: false,
        },
        include: {
          bets: true,
        },
      })
    );

    if (!aviciPrediction) {
      return res.status(200).json({
        ok: true,
        found: false,
        message: 'No unresolved AVICI prediction found',
      });
    }

    // Extract symbol and strike from title
    const titleMatch = aviciPrediction.title.match(
      /Will\s+([A-Za-z0-9]+)\s+trade\s+above\s+\$([0-9.]+)\s+in\s+24\s*hours\?/i
    );

    const symbol = titleMatch ? titleMatch[1].toUpperCase() : 'AVICI';
    const strike = titleMatch ? parseFloat(titleMatch[2]) : null;

    // Get current price
    const currentPrice = await getPriceBySymbol(symbol);

    return res.status(200).json({
      ok: true,
      found: true,
      prediction: {
        id: aviciPrediction.id,
        title: aviciPrediction.title,
        category: aviciPrediction.category,
        status: aviciPrediction.status,
        resolved: aviciPrediction.resolved,
        endsAt: aviciPrediction.endsAt?.toISOString(),
        mystPoolYes: aviciPrediction.mystPoolYes,
        mystPoolNo: aviciPrediction.mystPoolNo,
      },
      price: {
        symbol,
        strike,
        currentPrice,
        targetHit: strike && currentPrice ? currentPrice >= strike : false,
      },
      shouldResolve: strike && currentPrice ? currentPrice >= strike : false,
    });
  } catch (error: any) {
    console.error('[Debug AVICI] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Internal server error',
    });
  }
}

