import type { NextApiRequest, NextApiResponse } from 'next';

// Import bot webhook handler
let webhookHandler: any = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Dynamically import the webhook handler
    if (!webhookHandler) {
      const botModule = await import('../../../bot/src/index.js');
      webhookHandler = botModule.webhookHandler;
    }

    return webhookHandler(req, res);
  } catch (error: any) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
