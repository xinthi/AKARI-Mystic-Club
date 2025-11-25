/**
 * X (Twitter) OAuth 2.0 Callback
 *
 * Handles the redirect from X after user authorization
 * Exchanges code for tokens and stores in DB
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';

interface TwitterTokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  scope: string;
  refresh_token?: string;
}

interface TwitterUserResponse {
  data: {
    id: string;
    name: string;
    username: string;
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code, state, error, error_description } = req.query;

  // Handle errors from X
  if (error) {
    console.error('X OAuth error:', error, error_description);
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Connection Failed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
            .container { text-align: center; padding: 2rem; }
            h1 { color: #e74c3c; }
            p { color: #bbb; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Connection Failed</h1>
            <p>${error_description || 'Authorization was denied or an error occurred.'}</p>
            <p>You can close this window and return to Telegram.</p>
          </div>
        </body>
      </html>
    `);
  }

  if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invalid Request</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
            .container { text-align: center; padding: 2rem; }
            h1 { color: #e74c3c; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Invalid Request</h1>
            <p>Missing required parameters.</p>
          </div>
        </body>
      </html>
    `);
  }

  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Missing TWITTER_CLIENT_ID or TWITTER_CLIENT_SECRET');
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Server Error</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
            .container { text-align: center; padding: 2rem; }
            h1 { color: #e74c3c; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Server Error</h1>
            <p>Server is not configured correctly.</p>
          </div>
        </body>
      </html>
    `);
  }

  // Decode state
  let stateData: { telegramId: string; codeVerifier: string; timestamp: number };
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf-8');
    stateData = JSON.parse(decoded);
  } catch (e) {
    console.error('Failed to decode state:', e);
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invalid State</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
            .container { text-align: center; padding: 2rem; }
            h1 { color: #e74c3c; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Invalid State</h1>
            <p>State parameter is invalid or expired.</p>
          </div>
        </body>
      </html>
    `);
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000'}/api/auth/x/callback`;

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: stateData.codeVerifier,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', tokenResponse.status, errorText);
      throw new Error('Failed to exchange code for tokens');
    }

    const tokens: TwitterTokenResponse = await tokenResponse.json();

    // Get user info from X
    const userResponse = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error('Failed to get X user info:', userResponse.status, errorText);
      throw new Error('Failed to get user info from X');
    }

    const xUser: TwitterUserResponse = await userResponse.json();

    // Find user by telegramId
    const user = await prisma.user.findUnique({
      where: { telegramId: stateData.telegramId },
    });

    if (!user) {
      console.error('User not found for telegramId:', stateData.telegramId);
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>User Not Found</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: system-ui, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
              .container { text-align: center; padding: 2rem; }
              h1 { color: #e74c3c; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>❌ User Not Found</h1>
              <p>Please authenticate with Telegram first.</p>
            </div>
          </body>
        </html>
      `);
    }

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Upsert TwitterAccount
    await prisma.twitterAccount.upsert({
      where: { twitterUserId: xUser.data.id },
      update: {
        userId: user.id,
        handle: xUser.data.username,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt,
      },
      create: {
        userId: user.id,
        twitterUserId: xUser.data.id,
        handle: xUser.data.username,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt,
      },
    });

    // Return success page
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>X Connected!</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
            .container { text-align: center; padding: 2rem; }
            h1 { color: #10b981; }
            .handle { font-size: 1.5rem; color: #8b5cf6; margin: 1rem 0; }
            p { color: #bbb; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ X Account Connected!</h1>
            <div class="handle">@${xUser.data.username}</div>
            <p>You can close this window and return to Telegram.</p>
          </div>
        </body>
      </html>
    `);
  } catch (e: any) {
    console.error('X OAuth callback error:', e);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Connection Failed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
            .container { text-align: center; padding: 2rem; }
            h1 { color: #e74c3c; }
            p { color: #bbb; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Connection Failed</h1>
            <p>${e.message || 'An error occurred while connecting your X account.'}</p>
            <p>You can close this window and try again.</p>
          </div>
        </body>
      </html>
    `);
  }
}

