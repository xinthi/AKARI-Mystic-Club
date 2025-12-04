import type { NextApiRequest, NextApiResponse } from 'next';
import { getLaunchByIdWithMetrics } from '@/lib/portal/db';
import { withDbRetry } from '@/lib/prisma';

export type LaunchDetail = {
  id: string;
  name: string;
  tokenSymbol: string;
  tokenName: string | null;
  category: string | null;
  platformName: string | null;
  platformKind: string | null;
  listingPlatformName: string | null;
  listingPlatformKind: string | null;
  leadInvestorName: string | null;
  salePriceUsd: number | null;
  latestPriceUsd: number | null;
  roiPercent: number | null;
  chain: string | null;
  status: string | null;
  totalRaiseUsd: number | null;
  tokensForSale: number | null;
  airdropPercent: number | null;
  airdropValueUsd: number | null;
  vestingInfo: any;
  tokenAddress: string | null;
  priceSource: string | null;
  latestSnapshot: {
    priceUsd: number;
    volume24h: number | null;
    liquidity: number | null;
    source: string;
    fetchedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

type Response =
  | { ok: true; launch: LaunchDetail }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Response>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, error: 'Invalid launch ID' });
  }

  try {
    const launch = await withDbRetry(() => getLaunchByIdWithMetrics(id));

    if (!launch) {
      return res.status(404).json({ ok: false, error: 'Launch not found' });
    }

    const detail: LaunchDetail = {
      id: launch.id,
      name: launch.name,
      tokenSymbol: launch.tokenSymbol,
      tokenName: launch.tokenName,
      category: launch.category,
      platformName:
        launch.primaryPlatform?.name ||
        launch.platform?.name ||
        null,
      platformKind: launch.primaryPlatform?.kind || null,
      listingPlatformName: launch.listingPlatform?.name || null,
      listingPlatformKind: launch.listingPlatform?.kind || null,
      leadInvestorName: launch.leadInvestor?.name || null,
      salePriceUsd: launch.salePriceUsd,
      latestPriceUsd: launch.latestSnapshot?.priceUsd || null,
      roiPercent: launch.roiPercent,
      chain: launch.chain,
      status: launch.status,
      totalRaiseUsd: launch.totalRaiseUsd,
      tokensForSale: launch.tokensForSale,
      airdropPercent: launch.airdropPercent,
      airdropValueUsd: launch.airdropValueUsd,
      vestingInfo: launch.vestingInfo,
      tokenAddress: launch.tokenAddress,
      priceSource: launch.priceSource,
      latestSnapshot: launch.latestSnapshot ? {
        priceUsd: launch.latestSnapshot.priceUsd,
        volume24h: launch.latestSnapshot.volume24h,
        liquidity: launch.latestSnapshot.liquidity,
        source: launch.latestSnapshot.source,
        fetchedAt: launch.latestSnapshot.fetchedAt.toISOString(),
      } : null,
      createdAt: launch.createdAt.toISOString(),
      updatedAt: launch.updatedAt.toISOString(),
    };

    return res.status(200).json({ ok: true, launch: detail });
  } catch (error: any) {
    console.error(`[API /portal/new-launches/${id}] Error:`, error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch launch',
    });
  }
}

