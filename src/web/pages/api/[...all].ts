// Proxy API requests to Express API
import type { NextApiRequest, NextApiResponse } from 'next';

// This will be handled by Vercel serverless functions
// The actual API is in src/api/index.ts
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(404).json({ error: 'API route not found. Use /api/webhook, /api/profile, etc.' });
}

