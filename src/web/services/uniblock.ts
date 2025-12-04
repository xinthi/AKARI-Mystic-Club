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

