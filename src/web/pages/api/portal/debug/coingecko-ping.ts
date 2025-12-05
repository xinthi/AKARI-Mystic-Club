/**
 * Debug endpoint for testing CoinGecko API connectivity
 * 
 * GET /api/portal/debug/coingecko-ping
 * 
 * Returns detailed diagnostics about whether CoinGecko API is reachable
 * and whether the API key is working correctly.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

type PingResponse = {
  ok: boolean;
  hasPing: boolean;
  pingStatus: number | null;
  pingError: string | null;
  marketsCount: number | null;
  marketsStatus: number | null;
  marketsError: string | null;
  baseUrl: string;
  hasApiKey: boolean;
};

/**
 * Make a diagnostic request to CoinGecko
 * Returns detailed status information
 */
async function diagnosticFetch(
  url: string,
  useApiKey: boolean
): Promise<{ ok: boolean; status: number | null; error: string | null; data: any }> {
  const apiKey = process.env.COINGECKO_API_KEY;
  
  const headers: HeadersInit = { Accept: 'application/json' };
  if (useApiKey && apiKey) {
    headers['x-cg-demo-api-key'] = apiKey;
    headers['x-cg-pro-api-key'] = apiKey;
    headers['x-cg-api-key'] = apiKey;
  }

  try {
    console.log('[coingecko-ping] Fetching:', url, 'useApiKey=', !!(useApiKey && apiKey));
    const resp = await fetch(url, { headers });
    
    if (!resp.ok) {
      const text = await resp.text().catch(() => '(no body)');
      console.error('[coingecko-ping] Error:', url, 'status=', resp.status, resp.statusText, 'body=', text?.slice(0, 300));
      return {
        ok: false,
        status: resp.status,
        error: `${resp.status} ${resp.statusText}: ${text?.slice(0, 200) || '(no body)'}`,
        data: null,
      };
    }

    const data = await resp.json();
    return { ok: true, status: resp.status, error: null, data };
  } catch (err: any) {
    console.error('[coingecko-ping] Exception:', url, err);
    return {
      ok: false,
      status: null,
      error: err?.message || 'Unknown exception',
      data: null,
    };
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PingResponse>
) {
  const hasApiKey = !!process.env.COINGECKO_API_KEY;

  console.log('[coingecko-ping] Starting diagnostics...');
  console.log('[coingecko-ping] hasApiKey:', hasApiKey);

  // Test /ping endpoint
  let hasPing = false;
  let pingStatus: number | null = null;
  let pingError: string | null = null;

  // First try with API key
  let pingResult = await diagnosticFetch(`${COINGECKO_BASE_URL}/ping`, true);
  
  if (!pingResult.ok && hasApiKey) {
    // Fallback: try without API key
    console.log('[coingecko-ping] /ping with API key failed, trying without...');
    pingResult = await diagnosticFetch(`${COINGECKO_BASE_URL}/ping`, false);
  }

  hasPing = pingResult.ok;
  pingStatus = pingResult.status;
  pingError = pingResult.error;

  // Test /coins/markets endpoint
  let marketsCount: number | null = null;
  let marketsStatus: number | null = null;
  let marketsError: string | null = null;

  const marketsUrl = `${COINGECKO_BASE_URL}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=5&page=1`;
  
  // First try with API key
  let marketsResult = await diagnosticFetch(marketsUrl, true);
  
  if (!marketsResult.ok && hasApiKey) {
    // Fallback: try without API key
    console.log('[coingecko-ping] /coins/markets with API key failed, trying without...');
    marketsResult = await diagnosticFetch(marketsUrl, false);
  }

  marketsStatus = marketsResult.status;
  marketsError = marketsResult.error;
  
  if (marketsResult.ok && Array.isArray(marketsResult.data)) {
    marketsCount = marketsResult.data.length;
  }

  const allOk = hasPing && marketsCount !== null && marketsCount > 0;

  console.log('[coingecko-ping] Results:', {
    hasPing,
    pingStatus,
    pingError,
    marketsCount,
    marketsStatus,
    marketsError,
  });

  res.status(allOk ? 200 : 502).json({
    ok: allOk,
    hasPing,
    pingStatus,
    pingError,
    marketsCount,
    marketsStatus,
    marketsError,
    baseUrl: COINGECKO_BASE_URL,
    hasApiKey,
  });
}
