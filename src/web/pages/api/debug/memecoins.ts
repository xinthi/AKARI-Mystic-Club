/**
 * Debug endpoint for Meme Coin Radar
 * 
 * Returns top Pump.fun memecoins from CoinGecko.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getTopPumpFunMemecoins } from '../../../services/memecoinRadar';

type MemeCoinsResponse = {
  ok: boolean;
  memecoins: Awaited<ReturnType<typeof getTopPumpFunMemecoins>>;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MemeCoinsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      memecoins: [],
      error: 'Method not allowed',
    });
  }

  try {
    const memecoins = await getTopPumpFunMemecoins(10);

    return res.status(200).json({
      ok: true,
      memecoins,
    });
  } catch (error: any) {
    console.error('[Debug: Memecoins] Error:', error);
    return res.status(500).json({
      ok: false,
      memecoins: [],
      error: error.message || 'Failed to fetch memecoins',
    });
  }
}

