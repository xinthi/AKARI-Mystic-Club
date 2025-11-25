import type { NextApiRequest, NextApiResponse } from 'next';

let webhookHandler: any = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check TELEGRAM_BOT_TOKEN first
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('Missing TELEGRAM_BOT_TOKEN');
    return res.status(500).send('Missing token');
  }

  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL');
    return res.status(500).json({ error: 'Database not configured' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Lazy load webhook handler to avoid build-time issues
    if (!webhookHandler) {
      // Dynamic import to avoid build-time resolution
      const botModule = await import('../../bot/src/index.js');
      webhookHandler = botModule.handler;
      
      if (!webhookHandler || typeof webhookHandler !== 'function') {
        console.error('Webhook handler is not a function:', typeof webhookHandler);
        return res.status(500).json({ error: 'Handler not available' });
      }
    }

    // Call the handler directly with req and res
    await webhookHandler(req, res);
  } catch (error: any) {
    console.error('Webhook error:', error);
    console.error('Error stack:', error.stack);
    // Don't send error if response already sent
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
}
