import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '@/lib/prisma';
import { getAllLaunchesWithMetrics } from '@/lib/portal/db';

type LaunchListItem = {
  id: string;
  name: string;
  tokenSymbol: string;
  platformName: string | null;
  createdAt: string;
};

type GetResponse =
  | { ok: true; launches: LaunchListItem[] }
  | { ok: false; error: string };

type PostResponse =
  | { ok: true; launch: { id: string } }
  | { ok: false; error: string };

type PutResponse =
  | { ok: true; launch: { id: string } }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetResponse | PostResponse | PutResponse>
) {
  // TODO: Add admin auth check here
  // const isAdmin = await ensureAdmin(req);
  // if (!isAdmin) {
  //   return res.status(403).json({ ok: false, error: 'Unauthorized' });
  // }

  if (req.method === 'GET') {
    try {
      const launches = await withDbRetry(() => getAllLaunchesWithMetrics());

      const list: LaunchListItem[] = launches.map((launch) => ({
        id: launch.id,
        name: launch.name,
        tokenSymbol: launch.tokenSymbol,
        platformName: launch.platform?.name || null,
        createdAt: launch.createdAt.toISOString(),
      }));

      return res.status(200).json({ ok: true, launches: list });
    } catch (error: any) {
      console.error('[API /portal/admin/new-launches] GET Error:', error);
      return res.status(500).json({
        ok: false,
        error: error.message || 'Failed to fetch launches',
      });
    }
  }

  if (req.method === 'POST') {
    try {
      const {
        name,
        tokenSymbol,
        tokenName,
        platformId,
        salePriceUsd,
        totalRaiseUsd,
        tokensForSale,
        chain,
        category,
        status,
        tokenAddress,
        priceSource,
        airdropPercent,
        airdropValueUsd,
        vestingInfo,
      } = req.body;

      if (!name || !tokenSymbol) {
        return res.status(400).json({
          ok: false,
          error: 'Name and tokenSymbol are required',
        });
      }

      const launch = await withDbRetry(() =>
        prisma.newLaunch.create({
          data: {
            name,
            tokenSymbol,
            tokenName: tokenName || null,
            platformId: platformId || null,
            salePriceUsd: salePriceUsd ? parseFloat(salePriceUsd) : null,
            totalRaiseUsd: totalRaiseUsd ? parseFloat(totalRaiseUsd) : null,
            tokensForSale: tokensForSale ? parseFloat(tokensForSale) : null,
            chain: chain || null,
            category: category || null,
            status: status || null,
            tokenAddress: tokenAddress || null,
            priceSource: priceSource || null,
            airdropPercent: airdropPercent ? parseFloat(airdropPercent) : null,
            airdropValueUsd: airdropValueUsd ? parseFloat(airdropValueUsd) : null,
            vestingInfo: vestingInfo
              ? typeof vestingInfo === 'string'
                ? JSON.parse(vestingInfo)
                : vestingInfo
              : null,
          },
        })
      );

      return res.status(201).json({ ok: true, launch: { id: launch.id } });
    } catch (error: any) {
      console.error('[API /portal/admin/new-launches] POST Error:', error);
      return res.status(500).json({
        ok: false,
        error: error.message || 'Failed to create launch',
      });
    }
  }

  if (req.method === 'PUT') {
    try {
      const {
        id,
        name,
        tokenSymbol,
        tokenName,
        platformId,
        salePriceUsd,
        totalRaiseUsd,
        tokensForSale,
        chain,
        category,
        status,
        tokenAddress,
        priceSource,
        airdropPercent,
        airdropValueUsd,
        vestingInfo,
      } = req.body;

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: 'Launch ID is required',
        });
      }

      const launch = await withDbRetry(() =>
        prisma.newLaunch.update({
          where: { id },
          data: {
            ...(name && { name }),
            ...(tokenSymbol && { tokenSymbol }),
            ...(tokenName !== undefined && { tokenName: tokenName || null }),
            ...(platformId !== undefined && { platformId: platformId || null }),
            ...(salePriceUsd !== undefined && {
              salePriceUsd: salePriceUsd ? parseFloat(salePriceUsd) : null,
            }),
            ...(totalRaiseUsd !== undefined && {
              totalRaiseUsd: totalRaiseUsd ? parseFloat(totalRaiseUsd) : null,
            }),
            ...(tokensForSale !== undefined && {
              tokensForSale: tokensForSale ? parseFloat(tokensForSale) : null,
            }),
            ...(chain !== undefined && { chain: chain || null }),
            ...(category !== undefined && { category: category || null }),
            ...(status !== undefined && { status: status || null }),
            ...(tokenAddress !== undefined && { tokenAddress: tokenAddress || null }),
            ...(priceSource !== undefined && { priceSource: priceSource || null }),
            ...(airdropPercent !== undefined && {
              airdropPercent: airdropPercent ? parseFloat(airdropPercent) : null,
            }),
            ...(airdropValueUsd !== undefined && {
              airdropValueUsd: airdropValueUsd ? parseFloat(airdropValueUsd) : null,
            }),
            ...(vestingInfo !== undefined && {
              vestingInfo:
                vestingInfo && typeof vestingInfo === 'string'
                  ? JSON.parse(vestingInfo)
                  : vestingInfo || null,
            }),
          },
        })
      );

      return res.status(200).json({ ok: true, launch: { id: launch.id } });
    } catch (error: any) {
      console.error('[API /portal/admin/new-launches] PUT Error:', error);
      return res.status(500).json({
        ok: false,
        error: error.message || 'Failed to update launch',
      });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

