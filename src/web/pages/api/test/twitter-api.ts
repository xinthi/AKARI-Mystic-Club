/**
 * Test API endpoint to verify Twitter API key is working
 * GET /api/test/twitter-api?username=0x_jhayy
 * 
 * This endpoint tests if TWITTERAPIIO_API_KEY is configured and working
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { taioGetUserInfo } from '@/server/twitterapiio';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username } = req.query;
  const testUsername = (username as string) || '0x_jhayy';

  try {
    // Check if API key is configured
    const apiKey = process.env.TWITTERAPIIO_API_KEY;
    const apiKeyStatus = apiKey ? 'CONFIGURED' : 'NOT CONFIGURED';
    const apiKeyLength = apiKey ? apiKey.length : 0;

    console.log(`[Twitter API Test] Testing Twitter API for username: ${testUsername}`);
    console.log(`[Twitter API Test] API Key Status: ${apiKeyStatus} (length: ${apiKeyLength})`);

    if (!apiKey) {
      return res.status(200).json({
        success: false,
        error: 'TWITTERAPIIO_API_KEY is not configured',
        apiKeyStatus: 'NOT CONFIGURED',
        message: 'Please set TWITTERAPIIO_API_KEY in your environment variables',
      });
    }

    // Test the API call
    console.log(`[Twitter API Test] Attempting to fetch user info for ${testUsername}...`);
    const startTime = Date.now();
    
    const userInfo = await taioGetUserInfo(testUsername);
    const elapsed = Date.now() - startTime;

    if (userInfo) {
      console.log(`[Twitter API Test] ✓ Successfully fetched user info for ${testUsername}`);
      console.log(`[Twitter API Test] Response time: ${elapsed}ms`);
      console.log(`[Twitter API Test] User ID: ${userInfo.id}`);
      console.log(`[Twitter API Test] Username: ${userInfo.username}`);
      console.log(`[Twitter API Test] Name: ${userInfo.name}`);
      console.log(`[Twitter API Test] Profile Image URL: ${userInfo.profileImageUrl ? userInfo.profileImageUrl.substring(0, 60) + '...' : 'NONE'}`);

      return res.status(200).json({
        success: true,
        apiKeyStatus: 'CONFIGURED',
        apiKeyLength,
        testUsername,
        responseTime: `${elapsed}ms`,
        userInfo: {
          id: userInfo.id,
          username: userInfo.username,
          name: userInfo.name,
          profileImageUrl: userInfo.profileImageUrl,
          followers: userInfo.followers,
          following: userInfo.following,
          tweetCount: userInfo.tweetCount,
          isBlueVerified: userInfo.isBlueVerified,
        },
        message: 'Twitter API is working correctly!',
      });
    } else {
      console.warn(`[Twitter API Test] ✗ Failed to fetch user info for ${testUsername} (returned null)`);
      return res.status(200).json({
        success: false,
        apiKeyStatus: 'CONFIGURED',
        apiKeyLength,
        testUsername,
        responseTime: `${elapsed}ms`,
        error: 'User not found or API returned null',
        message: 'Twitter API key is configured but user lookup failed. This could mean the user does not exist or the API returned an error.',
      });
    }
  } catch (error: any) {
    console.error(`[Twitter API Test] ✗ Error testing Twitter API:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
      message: 'Twitter API test failed. Check server logs for details.',
    });
  }
}
