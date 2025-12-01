/**
 * Telegram Webhook Handler
 * 
 * Uses Grammy.js webhookCallback for clean serverless integration.
 * Bot is pre-initialized with botInfo to avoid async init in serverless.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { webhookCallback } from 'grammy';
import { bot } from '../../lib/telegram-bot';

// Create webhook handler using Grammy's webhookCallback
const handleUpdate = webhookCallback(bot, 'http');

// Configure Next.js to use raw body for Telegram webhook
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  // Validate bot token
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('[Webhook] Missing TELEGRAM_BOT_TOKEN');
    return res.status(500).json({ ok: false, error: 'Bot token not configured' });
  }

  // Optional: Validate webhook secret
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    if (secretHeader !== webhookSecret) {
      console.error('[Webhook] Invalid webhook secret');
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  // Set timeout for webhook processing (25 seconds - Telegram allows up to 30s)
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.warn('[Webhook] Request timeout - sending 200 to prevent retry');
      res.status(200).json({ ok: true, timeout: true });
    }
  }, 25000);

  try {
    console.log('[Webhook] Processing update...');
    
    // Handle update using Grammy's webhookCallback
    await handleUpdate(req, res);
    
    clearTimeout(timeout);
    console.log('[Webhook] Update processed successfully');
    
    // Ensure response is sent if handler didn't send one
    if (!res.headersSent) {
      return res.status(200).json({ ok: true });
    }
  } catch (error: any) {
    clearTimeout(timeout);
    console.error('[Webhook] Error:', error.message);
    console.error('[Webhook] Stack:', error.stack);
    
    if (!res.headersSent) {
      return res.status(500).json({ 
        ok: false, 
        error: 'Internal server error',
      });
    }
  }
}
