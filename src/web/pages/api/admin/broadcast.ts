/**
 * Admin Broadcast API
 * 
 * POST /api/admin/broadcast
 * 
 * Send a message to all users with allowAnnouncements = true
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { bot } from '../../../lib/telegram-bot';

interface BroadcastRequest {
  title?: string;
  message: string;
  includeMiniAppButton?: boolean;
}

interface BroadcastResponse {
  ok: boolean;
  sent?: number;
  failed?: number;
  total?: number;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BroadcastResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  // Verify admin token
  const adminToken = process.env.ADMIN_PANEL_TOKEN;
  if (!adminToken) {
    return res.status(500).json({ ok: false, message: 'Admin panel not configured' });
  }

  const providedToken = req.headers['x-admin-token'] as string | undefined;
  if (!providedToken || providedToken !== adminToken) {
    return res.status(403).json({ ok: false, message: 'Forbidden' });
  }

  try {
    const { title, message, includeMiniAppButton } = req.body as BroadcastRequest;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ ok: false, message: 'Message is required' });
    }

    // Get all users who allow announcements
    const users = await prisma.user.findMany({
      where: { allowAnnouncements: true },
      select: { telegramId: true, username: true },
    });

    if (users.length === 0) {
      return res.status(200).json({
        ok: true,
        sent: 0,
        failed: 0,
        total: 0,
        message: 'No users to broadcast to',
      });
    }

    // Build message text
    let text = '';
    if (title) {
      text += `<b>${title}</b>\n\n`;
    }
    text += message;

    // Build keyboard
    const webAppUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://play.akarimystic.club';
    const keyboard = includeMiniAppButton
      ? {
          inline_keyboard: [
            [{ text: '🚀 Open Mini App', web_app: { url: webAppUrl } }],
          ],
        }
      : undefined;

    // Send to all users
    let sent = 0;
    let failed = 0;

    console.log(`[Broadcast] Starting broadcast to ${users.length} users`);

    for (const user of users) {
      try {
        await bot.api.sendMessage(parseInt(user.telegramId, 10), text, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
        sent++;
      } catch (err: any) {
        failed++;
        // Log individual failures but continue
        console.warn(`[Broadcast] Failed to send to ${user.telegramId}:`, err?.message || 'Unknown error');
      }

      // Small delay to avoid rate limiting
      if ((sent + failed) % 30 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`[Broadcast] Complete: ${sent} sent, ${failed} failed out of ${users.length}`);

    return res.status(200).json({
      ok: true,
      sent,
      failed,
      total: users.length,
      message: `Broadcast complete: ${sent} sent, ${failed} failed`,
    });
  } catch (error: any) {
    console.error('[Broadcast] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

