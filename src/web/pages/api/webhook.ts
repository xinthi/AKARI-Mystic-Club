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

    // Ensure body is parsed (Next.js should do this automatically, but ensure it's an object)
    const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    if (!update || !update.update_id) {
      console.error('Invalid update format:', update);
      return res.status(400).json({ error: 'Invalid update format' });
    }
    
    // Call webhook handler with parsed update (it will send the response)
    await webhookHandler({ body: update }, res);
  } catch (error: any) {
    console.error('Webhook error:', error);
    // Don't send error if response already sent
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
}
