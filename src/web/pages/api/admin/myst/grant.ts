/**
 * Admin MYST Grant API
 * 
 * POST /api/admin/myst/grant
 * 
 * Allows admins to manually grant MYST to specific users.
 * Protected by ADMIN_PANEL_TOKEN environment variable.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { creditMyst, getMystBalance } from '../../../../lib/myst-service';

const MAX_GRANT_AMOUNT = 10000; // Safety limit

interface GrantRequest {
  userId?: string;
  telegramId?: string;
  amount: number;
  reason?: string;
}

interface GrantResponse {
  ok: boolean;
  newBalance?: number;
  granted?: number;
  userId?: string;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GrantResponse>
) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  // Verify admin token
  const adminToken = process.env.ADMIN_PANEL_TOKEN;
  if (!adminToken) {
    console.error('[Admin/MystGrant] ADMIN_PANEL_TOKEN not configured');
    return res.status(500).json({ ok: false, message: 'Admin panel not configured' });
  }

  const providedToken = req.headers['x-admin-token'] as string | undefined;
  if (!providedToken || providedToken !== adminToken) {
    console.warn('[Admin/MystGrant] Invalid admin token');
    return res.status(403).json({ ok: false, message: 'Forbidden' });
  }

  try {
    const { userId, telegramId, amount, reason } = req.body as GrantRequest;

    // Validate amount
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ ok: false, message: 'Invalid amount' });
    }

    if (amount > MAX_GRANT_AMOUNT) {
      return res.status(400).json({ ok: false, message: `Amount exceeds maximum (${MAX_GRANT_AMOUNT})` });
    }

    // Find user by userId or telegramId
    let targetUserId = userId;
    if (!targetUserId && telegramId) {
      const user = await prisma.user.findUnique({
        where: { telegramId: String(telegramId) },
        select: { id: true },
      });
      if (!user) {
        return res.status(404).json({ ok: false, message: 'User not found with telegramId' });
      }
      targetUserId = user.id;
    }

    if (!targetUserId) {
      return res.status(400).json({ ok: false, message: 'userId or telegramId required' });
    }

    // Verify user exists
    const userExists = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, username: true },
    });
    if (!userExists) {
      return res.status(404).json({ ok: false, message: 'User not found' });
    }

    // Grant MYST
    const { credited, newBalance } = await creditMyst(
      prisma,
      targetUserId,
      amount,
      'admin_grant',
      { reason: reason || 'Admin grant', grantedAt: new Date().toISOString() }
    );

    console.log(`[Admin/MystGrant] Granted ${credited} MYST to user ${targetUserId} (${userExists.username}). Reason: ${reason || 'N/A'}`);

    return res.status(200).json({
      ok: true,
      granted: credited,
      newBalance,
      userId: targetUserId,
      message: `Successfully granted ${credited} MYST`,
    });

  } catch (error: any) {
    console.error('[Admin/MystGrant] Error:', error);
    return res.status(500).json({ ok: false, message: 'Failed to grant MYST' });
  }
}

