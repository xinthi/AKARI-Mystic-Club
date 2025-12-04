import type { NextApiRequest, NextApiResponse } from 'next';
import { getAllLaunchesWithMetrics } from '@/lib/portal/db';
import { withDbRetry } from '@/lib/prisma';

export type LaunchSummary = {
  id: string;
  name: string;
  tokenSymbol: string;
  platformName: string | null;
  salePriceUsd: number | null;
  latestPriceUsd: number | null;
  roiPercent: number | null;
  chain: string | null;
  status: string | null;
};

type Response =
  | { ok: true; launches: LaunchSummary[] }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Response>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const launches = await withDbRetry(() => getAllLaunchesWithMetrics());

    const summaries: LaunchSummary[] = launches.map((launch) => ({
      id: launch.id,
      name: launch.name,
      tokenSymbol: launch.tokenSymbol,
      platformName: launch.platform?.name || null,
      salePriceUsd: launch.salePriceUsd,
      latestPriceUsd: launch.latestSnapshot?.priceUsd || null,
      roiPercent: launch.roiPercent,
      chain: launch.chain,
      status: launch.status,
    }));

    return res.status(200).json({ ok: true, launches: summaries });
  } catch (error: any) {
    console.error('[API /portal/new-launches] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch launches',
    });
  }
}

