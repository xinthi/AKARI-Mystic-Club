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
    // Uniblock API endpoint for token transfers
    // Using the token transfers endpoint with filters
    const url = new URL(`${UNIBLOCK_API_BASE_URL}/tokens/${params.tokenAddress}/transfers`);
    url.searchParams.set('chain', params.chain);
    url.searchParams.set('limit', '100'); // Get up to 100 transfers
    
    if (params.sinceTimestamp) {
      // Convert unix timestamp to ISO string if needed
      const sinceDate = new Date(params.sinceTimestamp * 1000);
      url.searchParams.set('from', sinceDate.toISOString());
    }

    const response = await fetch(url.toString(), {
      headers: {
        'x-api-key': UNIBLOCK_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[Uniblock] API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data: UniblockResponse = await response.json();

    if (data.error) {
      console.error(`[Uniblock] API error: ${data.error}`);
      return [];
    }

    if (!data.data || data.data.length === 0) {
      return [];
    }

    // Filter and map transfers
    const whaleTransfers: WhaleTransfer[] = [];

    for (const transfer of data.data) {
      // Use valueUsd if available, otherwise skip (we need USD value to filter)
      if (!transfer.valueUsd || transfer.valueUsd < params.minUsd) {
        continue;
      }

      // Determine wallet (use 'to' address as the whale wallet)
      const wallet = transfer.to;

      whaleTransfers.push({
        tokenAddress: transfer.tokenAddress,
        wallet: wallet,
        amountUsd: transfer.valueUsd,
        txHash: transfer.transactionHash,
        occurredAt: transfer.blockTimestamp,
        chain: transfer.chain || params.chain,
      });
    }

    return whaleTransfers;
  } catch (error) {
    console.error('[Uniblock] Error fetching large token transfers:', error);
    return [];
  }
}

