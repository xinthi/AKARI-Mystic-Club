/**
 * Telegram Webhook Handler
 * 
 * Uses Grammy.js webhookCallback for clean serverless integration.
 * No dynamic imports, no polling, no cron jobs.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { bot } from '../../lib/telegram-bot';

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
    // Log incoming update for debugging
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    
    let updateData;
    try {
      updateData = JSON.parse(rawBody);
    } catch {
      console.error('Telegram webhook: Failed to parse body');
      return res.status(400).json({ ok: false, error: 'Invalid JSON' });
    }
    
    // Log what type of update we received
    const updateType = updateData.message ? 'message' : 
                       updateData.callback_query ? 'callback_query' :
                       updateData.my_chat_member ? 'my_chat_member' :
                       updateData.chat_member ? 'chat_member' :
                       'other';
    
    const chatId = updateData.message?.chat?.id || 
                   updateData.callback_query?.message?.chat?.id ||
                   updateData.my_chat_member?.chat?.id;
    
    const text = updateData.message?.text || '';
    const isCommand = text.startsWith('/');
    
    console.log(`[Webhook] Received: ${updateType}, chat: ${chatId}, text: ${text.substring(0, 50)}`);
    
    // Handle update using Grammy's bot.handleUpdate directly
    await bot.handleUpdate(updateData);
    
    console.log(`[Webhook] Processed: ${updateType}`);
    
    // Send success response
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
