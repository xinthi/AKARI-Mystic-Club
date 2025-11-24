// Webhook handler - proxy to Express API
import type { NextApiRequest, NextApiResponse } from 'next';

// Import the webhook handler from Express API
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // For Vercel, we'll handle this in a serverless function
  // The actual webhook is in src/api/index.ts
  if (req.method === 'POST') {
    try {
      // Import and call the webhook handler
      const { webhookHandler } = await import('../../../api/index');
      return webhookHandler(req, res);
    } catch (error) {
      console.error('Webhook error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

