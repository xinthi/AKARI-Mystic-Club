/**
 * Debug endpoint for testing CoinGecko API connectivity
 * 
 * GET /api/portal/debug/coingecko-ping
 * 
 * Returns information about whether CoinGecko API is reachable
 * and whether the API key is working correctly.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { cgFetch } from '../../../../services/coingecko';

type PingResponse = {
  ok: boolean;
  hasPing: boolean;
  marketsCount: number | null;
  baseUrl: string;
  hasApiKey: boolean;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PingResponse>
) {
  const hasApiKey = !!process.env.COINGECKO_API_KEY;
  const baseUrl = hasApiKey
    ? 'https://pro-api.coingecko.com/api/v3'
    : 'https://api.coingecko.com/api/v3';

  try {
    console.log('[coingecko-ping] Testing CoinGecko connectivity...');
    
    // Test /ping endpoint
    const ping = await cgFetch<any>('/ping');
    console.log('[coingecko-ping] /ping result:', ping);

    // Test /coins/markets endpoint
    const markets = await cgFetch<any[]>('/coins/markets', {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: 5,
      page: 1,
    });
    console.log('[coingecko-ping] /coins/markets count:', markets?.length ?? 0);

    res.status(200).json({
      ok: true,
      hasPing: !!ping,
      marketsCount: Array.isArray(markets) ? markets.length : null,
      baseUrl,
      hasApiKey,
    });
  } catch (e: any) {
    console.error('[coingecko-ping] Error:', e);
    res.status(500).json({
      ok: false,
      hasPing: false,
      marketsCount: null,
      baseUrl,
      hasApiKey,
      error: e?.message ?? 'Unknown error',
    });
  }
}

