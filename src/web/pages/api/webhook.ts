import type { NextApiRequest, NextApiResponse } from 'next';
import { getWebhookHandler } from '../../lib/bot-utils';

let webhookHandler: any = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!webhookHandler) {
      webhookHandler = await getWebhookHandler();
    }

    return webhookHandler(req, res);
  } catch (error: any) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
