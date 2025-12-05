/**
 * Uniblock API Service
 * 
 * Fetches large token transfers (whale entries) from Uniblock API.
 * 
 * Requires UNIBLOCK_API_KEY environment variable.
 * This service is server-side only and should not be imported in client components.
 */

const UNIBLOCK_API_KEY = process.env.UNIBLOCK_API_KEY;
const UNIBLOCK_API_BASE_URL = 'https://api.uniblock.dev/v1';

export type WhaleTransfer = {
  tokenAddress: string;
  wallet: string;
  amountUsd: number;
  txHash: string;
  occurredAt: string;
  chain: string;
};

export type StablecoinTransfer = {
  stableSymbol: 'USDT' | 'USDC';
  chain: string;
  from: string;
  to: string;
  amountUsd: number;
  txHash: string;
  occurredAt: string;
};

interface UniblockTokenTransfer {
  tokenAddress: string;
  from: string;
  to: string;
  value: string; // token amount in wei/smallest unit
  valueUsd?: number;
  transactionHash: string;
  blockTimestamp: string;
  chain: string;
}

interface UniblockResponse {
  data?: UniblockTokenTransfer[];
  error?: string;
}

/**
 * Get large token transfers for a given token address and chain.
 * Filters for transfers where USD value is >= minUsd.
 */
export async function getLargeTokenTransfers(params: {
  tokenAddress: string;
  chain: string;
  minUsd: number;
  sinceTimestamp?: number;
}): Promise<WhaleTransfer[]> {
  if (!UNIBLOCK_API_KEY) {
    throw new Error('UNIBLOCK_API_KEY environment variable is not set. This service requires an API key.');
  }

  try {
    // Use Uniblock provider-based endpoint (Moralis)
    const url = new URL(
      `${UNIBLOCK_API_BASE_URL}/direct/v1/Moralis/erc20/transfers`
    );
    url.searchParams.set('chain', params.chain);
    url.searchParams.set('contractAddress', params.tokenAddress);
    url.searchParams.set('limit', '100');
    
    if (params.sinceTimestamp) {
      url.searchParams.set('fromDate', new Date(params.sinceTimestamp * 1000).toISOString());
    }

    console.log('[Uniblock] Fetching transfers for URL:', url.toString());

    const response = await fetch(url.toString(), {
      headers: {
        'x-api-key': UNIBLOCK_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[Uniblock] API error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('[Uniblock] Error response body:', errorText);
      return [];
    }

    // Log raw response before parsing
    const raw = await response.text();
    console.log('[Uniblock] Raw response for URL:', url.toString());
    console.log('[Uniblock] Raw response:', raw);

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error('[Uniblock] JSON parse error:', err);
      return [];
    }

    if (data.error) {
      console.error(`[Uniblock] API error: ${data.error}`);
      return [];
    }

    // Handle different response structures (Moralis vs unified API)
    const transfers = data.result ?? data.data ?? [];

    if (!transfers || transfers.length === 0) {
      console.log('[Uniblock] No transfers found in response');
      return [];
    }

    console.log(`[Uniblock] Found ${transfers.length} raw transfers, filtering by minUsd=${params.minUsd}`);

    // Filter and map transfers
    const whaleTransfers: WhaleTransfer[] = [];

    for (const transfer of transfers) {
      // Try multiple field names for USD value
      const usd = transfer.usd_value ?? transfer.valueUsd ?? 0;
      
      if (usd < params.minUsd) {
        continue;
      }

      // Try multiple field names for wallet address
      const wallet = transfer.to_address ?? transfer.to ?? '';
      if (!wallet) {
        console.warn('[Uniblock] Transfer missing wallet address, skipping:', transfer);
        continue;
      }

      // Try multiple field names for transaction hash
      const txHash = transfer.hash ?? transfer.transaction_hash ?? transfer.transactionHash;
      if (!txHash) {
        console.warn('[Uniblock] Transfer missing transaction hash, skipping:', transfer);
        continue;
      }

      // Try multiple field names for timestamp
      const timestamp = transfer.block_timestamp ?? transfer.blockTimestamp ?? transfer.occurredAt;
      if (!timestamp) {
        console.warn('[Uniblock] Transfer missing timestamp, skipping:', transfer);
        continue;
      }

      whaleTransfers.push({
        tokenAddress: params.tokenAddress,
        wallet: wallet,
        amountUsd: usd,
        txHash: txHash,
        occurredAt: timestamp,
        chain: params.chain,
      });
    }

    console.log(`[Uniblock] Filtered to ${whaleTransfers.length} whale transfers (>= $${params.minUsd})`);
    return whaleTransfers;
  } catch (error) {
    console.error('[Uniblock] Error fetching large token transfers:', error);
    return [];
  }
}

const TRACKED_STABLECOINS: { symbol: 'USDT' | 'USDC'; tokenAddress: string }[] = [
  { symbol: 'USDT', tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7' }, // Ethereum USDT
  { symbol: 'USDC', tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' }, // Ethereum USDC
  // TODO: user can add Base/Solana/etc wrapped versions later
];

/**
 * Get recent stablecoin transfers for a given chain and stablecoin symbol.
 * Filters for transfers where USD value is >= minUsd (default 10,000).
 */
export async function getRecentStablecoinTransfers(params: {
  chain: string;
  stableSymbol: 'USDT' | 'USDC';
  sinceTimestamp: number; // unix seconds
  minUsd?: number;
}): Promise<StablecoinTransfer[]> {
  if (!UNIBLOCK_API_KEY) {
    console.error('[Uniblock] UNIBLOCK_API_KEY not set, returning empty array');
    return [];
  }

  const minUsd = params.minUsd ?? 10_000;

  // Find the token address for this stablecoin
  const stablecoin = TRACKED_STABLECOINS.find((s) => s.symbol === params.stableSymbol);
  if (!stablecoin) {
    console.warn(`[Uniblock] No token address found for ${params.stableSymbol}`);
    return [];
  }

  try {
    // Use the same Uniblock provider endpoint as whale transfers
    const url = new URL(`${UNIBLOCK_API_BASE_URL}/direct/v1/Moralis/erc20/transfers`);
    url.searchParams.set('chain', params.chain);
    url.searchParams.set('contractAddress', stablecoin.tokenAddress);
    url.searchParams.set('limit', '100');
    url.searchParams.set('fromDate', new Date(params.sinceTimestamp * 1000).toISOString());

    const response = await fetch(url.toString(), {
      headers: {
        'x-api-key': UNIBLOCK_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[Uniblock] Stablecoin API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const raw = await response.text();
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error('[Uniblock] JSON parse error for stablecoin transfers:', err);
      return [];
    }

    if (data.error) {
      console.error(`[Uniblock] API error: ${data.error}`);
      return [];
    }

    const transfers = data.result ?? data.data ?? [];
    if (!transfers || transfers.length === 0) {
      return [];
    }

    const stablecoinTransfers: StablecoinTransfer[] = [];

    for (const transfer of transfers) {
      const usd = transfer.usd_value ?? transfer.valueUsd ?? 0;
      if (usd < minUsd) continue;

      const from = transfer.from_address ?? transfer.from ?? '';
      const to = transfer.to_address ?? transfer.to ?? '';
      const txHash = transfer.hash ?? transfer.transaction_hash ?? transfer.transactionHash;
      const timestamp = transfer.block_timestamp ?? transfer.blockTimestamp ?? transfer.occurredAt;

      if (!from || !to || !txHash || !timestamp) {
        continue;
      }

      stablecoinTransfers.push({
        stableSymbol: params.stableSymbol,
        chain: params.chain,
        from,
        to,
        amountUsd: usd,
        txHash,
        occurredAt: timestamp,
      });
    }

    return stablecoinTransfers;
  } catch (error) {
    console.error('[Uniblock] Error fetching stablecoin transfers:', error);
    return [];
  }
}

