import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // For now, just log the query and body for debugging
  console.log('X callback hit:', {
    method: req.method,
    query: req.query,
    body: req.body,
  });

  // Return a simple success response so Telegram Mini App and front-end do not break
  return res.status(200).json({ ok: true, message: 'X callback stub endpoint' });
}

