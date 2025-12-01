/**
 * Admin Broadcast API
 * 
 * POST /api/admin/broadcast
 * 
 * Types:
 * - message: Send text to all users with allowAnnouncements = true
 * - poll: Send a poll to all users with allowAnnouncements = true
 * - csv: Send text to specific Telegram IDs from CSV
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { bot } from '../../../lib/telegram-bot';

interface BroadcastRequest {
  type?: 'message' | 'poll' | 'csv';
  // For message type
  title?: string;
  message?: string;
  includeMiniAppButton?: boolean;
  // For poll type
  pollQuestion?: string;
  pollOptions?: string[];
  pollAnonymous?: boolean;
  pollMultipleAnswers?: boolean;
  // For CSV type
  telegramIds?: string[];
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
    const body = req.body as BroadcastRequest;
    const type = body.type || 'message';

    // Handle different broadcast types
    switch (type) {
      case 'message':
        return await handleMessageBroadcast(body, res);
      case 'poll':
        return await handlePollBroadcast(body, res);
      case 'csv':
        return await handleCsvBroadcast(body, res);
      default:
        return res.status(400).json({ ok: false, message: 'Invalid broadcast type' });
    }
  } catch (error: any) {
    console.error('[Broadcast] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

// Handle regular message broadcast to signed-up users
async function handleMessageBroadcast(
  body: BroadcastRequest,
  res: NextApiResponse<BroadcastResponse>
) {
  const { title, message, includeMiniAppButton } = body;

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

  console.log(`[Broadcast] Starting message broadcast to ${users.length} users`);

  for (const user of users) {
    try {
      await bot.api.sendMessage(parseInt(user.telegramId, 10), text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      sent++;
    } catch (err: any) {
      failed++;
      console.warn(`[Broadcast] Failed to send to ${user.telegramId}:`, err?.message || 'Unknown error');
    }

    // Small delay to avoid rate limiting
    if ((sent + failed) % 30 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`[Broadcast] Message complete: ${sent} sent, ${failed} failed out of ${users.length}`);

  return res.status(200).json({
    ok: true,
    sent,
    failed,
    total: users.length,
    message: `Broadcast complete: ${sent} sent, ${failed} failed`,
  });
}

// Handle poll broadcast to signed-up users
async function handlePollBroadcast(
  body: BroadcastRequest,
  res: NextApiResponse<BroadcastResponse>
) {
  const { pollQuestion, pollOptions, pollAnonymous = true, pollMultipleAnswers = false } = body;

  if (!pollQuestion || typeof pollQuestion !== 'string' || pollQuestion.trim().length === 0) {
    return res.status(400).json({ ok: false, message: 'Poll question is required' });
  }

  if (!pollOptions || !Array.isArray(pollOptions) || pollOptions.length < 2) {
    return res.status(400).json({ ok: false, message: 'At least 2 poll options are required' });
  }

  const validOptions = pollOptions.filter(opt => typeof opt === 'string' && opt.trim().length > 0);
  if (validOptions.length < 2) {
    return res.status(400).json({ ok: false, message: 'At least 2 valid poll options are required' });
  }

  // Get all users who allow announcements
  const users = await prisma.user.findMany({
    where: { allowAnnouncements: true },
    select: { telegramId: true },
  });

  if (users.length === 0) {
    return res.status(200).json({
      ok: true,
      sent: 0,
      failed: 0,
      total: 0,
      message: 'No users to send poll to',
    });
  }

  // Send poll to all users
  let sent = 0;
  let failed = 0;

  console.log(`[Broadcast] Starting poll broadcast to ${users.length} users`);

  for (const user of users) {
    try {
      await bot.api.sendPoll(parseInt(user.telegramId, 10), pollQuestion.trim(), validOptions, {
        is_anonymous: pollAnonymous,
        allows_multiple_answers: pollMultipleAnswers,
      });
      sent++;
    } catch (err: any) {
      failed++;
      console.warn(`[Broadcast] Failed to send poll to ${user.telegramId}:`, err?.message || 'Unknown error');
    }

    // Small delay to avoid rate limiting
    if ((sent + failed) % 30 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`[Broadcast] Poll complete: ${sent} sent, ${failed} failed out of ${users.length}`);

  return res.status(200).json({
    ok: true,
    sent,
    failed,
    total: users.length,
    message: `Poll sent: ${sent} delivered, ${failed} failed`,
  });
}

// Handle CSV broadcast to specific Telegram IDs
async function handleCsvBroadcast(
  body: BroadcastRequest,
  res: NextApiResponse<BroadcastResponse>
) {
  const { telegramIds, message, includeMiniAppButton } = body;

  if (!telegramIds || !Array.isArray(telegramIds) || telegramIds.length === 0) {
    return res.status(400).json({ ok: false, message: 'No Telegram IDs provided' });
  }

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ ok: false, message: 'Message is required' });
  }

  // Validate and deduplicate Telegram IDs
  const validIds = [...new Set(telegramIds.filter(id => /^\d{6,15}$/.test(id)))];
  
  if (validIds.length === 0) {
    return res.status(400).json({ ok: false, message: 'No valid Telegram IDs provided' });
  }

  // Build keyboard
  const webAppUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://play.akarimystic.club';
  const keyboard = includeMiniAppButton
    ? {
        inline_keyboard: [
          [{ text: '🚀 Open Mini App', url: webAppUrl }],
        ],
      }
    : undefined;

  // Send to all IDs
  let sent = 0;
  let failed = 0;
  const failedIds: string[] = [];

  console.log(`[Broadcast] Starting CSV broadcast to ${validIds.length} Telegram IDs`);

  for (const telegramId of validIds) {
    try {
      await bot.api.sendMessage(parseInt(telegramId, 10), message.trim(), {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      sent++;
    } catch (err: any) {
      failed++;
      failedIds.push(telegramId);
      console.warn(`[Broadcast] Failed to send to ${telegramId}:`, err?.message || 'Unknown error');
    }

    // Small delay to avoid rate limiting
    if ((sent + failed) % 30 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`[Broadcast] CSV complete: ${sent} sent, ${failed} failed out of ${validIds.length}`);
  if (failedIds.length > 0 && failedIds.length <= 10) {
    console.log(`[Broadcast] Failed IDs: ${failedIds.join(', ')}`);
  }

  return res.status(200).json({
    ok: true,
    sent,
    failed,
    total: validIds.length,
    message: `CSV broadcast complete: ${sent} delivered, ${failed} failed`,
  });
}
