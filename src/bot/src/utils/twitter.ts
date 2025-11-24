// @ts-nocheck - This file is not type-checked by Next.js
import { TwitterApi } from 'twitter-api-v2';

/**
 * Initialize Twitter API client with Bearer token
 */
export function getTwitterClient() {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    throw new Error('TWITTER_BEARER_TOKEN is not set');
  }
  return new TwitterApi(bearerToken);
}

/**
 * Get Twitter OAuth client for user authentication
 */
export function getTwitterOAuthClient() {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('TWITTER_CLIENT_ID or TWITTER_CLIENT_SECRET is not set');
  }
  
  return new TwitterApi({
    clientId,
    clientSecret
  });
}

