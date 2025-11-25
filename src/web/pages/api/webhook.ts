/**
 * Telegram Webhook Handler
 * 
 * Uses Grammy.js webhookCallback for clean serverless integration.
 * No dynamic imports, no polling, no cron jobs.
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
    console.error('Telegram webhook error: Missing TELEGRAM_BOT_TOKEN');
    return res.status(500).json({ ok: false, error: 'Bot token not configured' });
  }

  // Optional: Validate webhook secret
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    if (secretHeader !== webhookSecret) {
      console.error('Telegram webhook error: Invalid webhook secret');
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  try {
    // Handle update using Grammy's webhookCallback
    await handleUpdate(req, res);
    
    // Ensure response is sent if handler didn't send one
    if (!res.headersSent) {
      return res.status(200).json({ ok: true });
    }
  } catch (error: any) {
    console.error('Telegram webhook error:', error);
    console.error('Error stack:', error.stack);
    
    if (!res.headersSent) {
      return res.status(500).json({ 
        ok: false, 
        error: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
      });
    }
  }
}
