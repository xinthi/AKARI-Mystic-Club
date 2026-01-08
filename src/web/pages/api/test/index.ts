/**
 * Test API Index - Shows available test endpoints
 * GET /api/test
 */

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    message: 'Test API Endpoints',
    endpoints: {
      twitterApi: {
        path: '/api/test/twitter-api',
        description: 'Test Twitter API key configuration',
        example: '/api/test/twitter-api?username=0x_jhayy',
        method: 'GET',
        queryParams: {
          username: 'Optional - Twitter username to test (default: 0x_jhayy)'
        }
      }
    },
    usage: 'Visit /api/test/twitter-api?username=YOUR_USERNAME to test the Twitter API'
  });
}
