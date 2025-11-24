import type { NextApiRequest, NextApiResponse } from 'next';

let webhookHandler: any = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Validate environment variables
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('Missing TELEGRAM_BOT_TOKEN');
    return res.status(500).json({ error: 'Bot token not configured' });
  }

  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL');
    return res.status(500).json({ error: 'Database not configured' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!webhookHandler) {
      // Dynamic import to avoid build-time resolution
      const { getWebhookHandler } = await import('../../lib/bot-utils');
      webhookHandler = await getWebhookHandler();
    }

    // Grammy's webhookCallback expects (req, res) directly
    // If it's the new handler, call it directly
    if (webhookHandler && typeof webhookHandler === 'function') {
      // Check if it's Grammy's webhookCallback (takes req, res)
      // or our legacy handler (takes { body }, res)
      try {
        // Try Grammy's format first
        await webhookHandler(req, res);
      } catch (err: any) {
        // Fallback to legacy format
        const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (!update || !update.update_id) {
          console.error('Invalid update format:', update);
          return res.status(400).json({ error: 'Invalid update format' });
        }
        await webhookHandler({ body: update }, res);
      }
    } else {
      // Legacy handler format
      const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!update || !update.update_id) {
        console.error('Invalid update format:', update);
        return res.status(400).json({ error: 'Invalid update format' });
      }
      await webhookHandler({ body: update }, res);
    }
  } catch (error: any) {
    console.error('Webhook error:', error);
    // Don't send error if response already sent
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
}
