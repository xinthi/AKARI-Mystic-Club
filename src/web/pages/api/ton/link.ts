/**
 * TON Wallet Link API
 * 
 * POST /api/ton/link
 * 
 * Links a TON wallet address to the user's account.
 * In production, this should verify a signature from TON Connect.
 * For now, we accept the address directly (to be enhanced later).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';

interface LinkResponse {
  ok: boolean;
  tonAddress?: string;
  linkedAt?: string;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LinkResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await getUserFromRequest(req, prisma);
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    const { tonAddress } = req.body as { tonAddress?: string };

    // Validate TON address format (basic check)
    if (!tonAddress || typeof tonAddress !== 'string') {
      return res.status(400).json({ ok: false, message: 'TON address required' });
    }

    // Basic TON address validation (starts with EQ or UQ, 48 chars)
    const tonRegex = /^(EQ|UQ)[A-Za-z0-9_-]{46}$/;
    if (!tonRegex.test(tonAddress)) {
      return res.status(400).json({ ok: false, message: 'Invalid TON address format' });
    }

    // TODO: In production, verify TON Connect signature here
    // For now, we trust the address provided by the frontend

    const linkedAt = new Date();

    // Update user with TON address
    await prisma.user.update({
      where: { id: user.id },
      data: {
        tonAddress,
        tonLinkedAt: linkedAt,
      },
    });

    console.log(`[TON] Wallet linked for user ${user.id}: ${tonAddress.substring(0, 10)}...`);

    return res.status(200).json({
      ok: true,
      tonAddress,
      linkedAt: linkedAt.toISOString(),
      message: 'TON wallet linked successfully',
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TON] linkWallet failed:', message);
    return res.status(500).json({ ok: false, message: 'Failed to link wallet' });
  }
}

