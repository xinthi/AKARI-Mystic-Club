/**
 * Website X (Twitter) OAuth 2.0 Callback
 *
 * Handles the redirect from X after user authorization.
 * Creates/updates user in akari_users tables and sets session cookie.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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
    profile_image_url?: string;
  };
}

// Create Supabase client with service role for user management
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Generate a secure session token
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code, state, error, error_description } = req.query;

  // Handle errors from X
  if (error) {
    console.error('[Website X OAuth] Error:', error, error_description);
    return res.redirect(`/login?error=${encodeURIComponent(String(error_description || error))}`);
  }

  if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
    return res.redirect('/login?error=missing_params');
  }

  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[Website X OAuth] Missing Twitter credentials');
    return res.redirect('/login?error=server_error');
  }

  // Decode state
  let stateData: { codeVerifier: string; timestamp: number; type: string };
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf-8');
    stateData = JSON.parse(decoded);
    
    if (stateData.type !== 'website_login') {
      throw new Error('Invalid state type');
    }
  } catch (e) {
    console.error('[Website X OAuth] Invalid state:', e);
    return res.redirect('/login?error=invalid_state');
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.host}`;
  const redirectUri = `${baseUrl}/api/auth/website/x/callback`;

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
      console.error('[Website X OAuth] Token exchange failed:', tokenResponse.status, errorText);
      return res.redirect('/login?error=token_exchange_failed');
    }

    const tokens: TwitterTokenResponse = await tokenResponse.json();

    // Get user info from X
    const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error('[Website X OAuth] Failed to get X user:', userResponse.status, errorText);
      return res.redirect('/login?error=user_fetch_failed');
    }

    const xUser: TwitterUserResponse = await userResponse.json();
    console.log('[Website X OAuth] X user:', xUser.data.username);

    // Get Supabase client
    const supabase = getSupabaseAdmin();

    // Check if user already exists with this X identity
    const { data: existingIdentity, error: identityError } = await supabase
      .from('akari_user_identities')
      .select('user_id')
      .eq('provider', 'x')
      .eq('provider_user_id', xUser.data.id)
      .single();

    let userId: string;

    if (existingIdentity) {
      // User exists - update their info
      userId = existingIdentity.user_id;
      console.log('[Website X OAuth] Existing user found:', userId);

      // Update user info
      await supabase
        .from('akari_users')
        .update({
          display_name: xUser.data.name,
          avatar_url: xUser.data.profile_image_url?.replace('_normal', '_400x400') || null,
        })
        .eq('id', userId);

      // Update identity username
      await supabase
        .from('akari_user_identities')
        .update({ username: xUser.data.username })
        .eq('provider', 'x')
        .eq('provider_user_id', xUser.data.id);

    } else {
      // New user - create account
      console.log('[Website X OAuth] Creating new user for:', xUser.data.username);

      // Create user
      const { data: newUser, error: userError } = await supabase
        .from('akari_users')
        .insert({
          display_name: xUser.data.name,
          avatar_url: xUser.data.profile_image_url?.replace('_normal', '_400x400') || null,
          is_active: true,
        })
        .select('id')
        .single();

      if (userError || !newUser) {
        console.error('[Website X OAuth] Failed to create user:', userError);
        return res.redirect('/login?error=user_creation_failed');
      }

      userId = newUser.id;

      // Create identity link
      const { error: linkError } = await supabase
        .from('akari_user_identities')
        .insert({
          user_id: userId,
          provider: 'x',
          provider_user_id: xUser.data.id,
          username: xUser.data.username,
        });

      if (linkError) {
        console.error('[Website X OAuth] Failed to create identity:', linkError);
        // Clean up user if identity creation failed
        await supabase.from('akari_users').delete().eq('id', userId);
        return res.redirect('/login?error=identity_creation_failed');
      }

      // Assign default 'user' role
      const { error: roleError } = await supabase
        .from('akari_user_roles')
        .insert({
          user_id: userId,
          role: 'user',
        });

      if (roleError) {
        console.error('[Website X OAuth] Failed to assign default role:', roleError);
        // Continue anyway - user can be assigned role later
      }
    }

    // Create session
    const sessionToken = generateSessionToken();
    const sessionExpiry = new Date();
    sessionExpiry.setDate(sessionExpiry.getDate() + 30); // 30 days

    // Store session in database
    const { error: sessionError } = await supabase
      .from('akari_user_sessions')
      .insert({
        user_id: userId,
        session_token: sessionToken,
        expires_at: sessionExpiry.toISOString(),
        user_agent: req.headers['user-agent'] || null,
      });

    if (sessionError) {
      console.error('[Website X OAuth] Failed to create session:', sessionError);
      // Try to continue without persisted session
    }

    // Set session cookie
    const cookieOptions = [
      `akari_session=${sessionToken}`,
      `Path=/`,
      `HttpOnly`,
      `SameSite=Lax`,
      `Max-Age=${30 * 24 * 60 * 60}`, // 30 days
    ];
    
    if (process.env.NODE_ENV === 'production') {
      cookieOptions.push('Secure');
      cookieOptions.push('Domain=.akarimystic.club'); // Shared across www and apex
    }

    res.setHeader('Set-Cookie', cookieOptions.join('; '));

    console.log('[Website X OAuth] Login successful for user:', userId);

    // Redirect to home or stored redirect URL
    return res.redirect('/portal/sentiment');

  } catch (e: any) {
    console.error('[Website X OAuth] Callback error:', e);
    return res.redirect(`/login?error=${encodeURIComponent(e.message || 'unknown_error')}`);
  }
}

