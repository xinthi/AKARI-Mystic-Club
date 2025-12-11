/**
 * API Route: POST /api/portal/promo/analyst-social-boost/verify
 * 
 * Verifies that the user has completed the quest requirements:
 * 1) Following @MysticHeros on X
 * 2) Posted a tweet tagging @MysticHeros
 * 
 * On success, grants 3 days of Analyst-level feature access.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { taioCheckFollowRelationship, taioGetUserLastTweets, taioAdvancedSearchTweets } from '../../../../../../server/twitterapiio';

// =============================================================================
// CONFIGURATION
// =============================================================================

const TARGET_X_HANDLE = 'MysticHeros';
const PROMO_DURATION_DAYS = 3;

// Feature keys to grant for Analyst-level access
const ANALYST_FEATURE_KEYS = [
  'markets.analytics',
  'sentiment.compare',
  'sentiment.search',
];

// =============================================================================
// TYPES
// =============================================================================

type PromoVerifyResponse =
  | {
      ok: true;
      grantedUntil: string;
    }
  | { ok: false; error: string; details?: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

async function getUserIdFromSession(req: NextApiRequest, supabase: ReturnType<typeof getSupabaseAdmin>): Promise<string | null> {
  const sessionToken = getSessionToken(req);
  if (!sessionToken) return null;

  const { data: session, error: sessionError } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (sessionError || !session) return null;

  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    return null;
  }

  return session.user_id;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PromoVerifyResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const userId = await getUserIdFromSession(req, supabase);

    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    // Load promo record
    const { data: promo, error: promoError } = await supabase
      .from('analyst_social_boost_promo')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (promoError || !promo) {
      return res.status(400).json({ ok: false, error: 'Promo record not found. Start the quest first.' });
    }

    // Must be in 'accepted' status to verify
    if (promo.status !== 'accepted') {
      return res.status(400).json({ 
        ok: false, 
        error: 'Quest not started',
        details: `Current status is "${promo.status}". Accept the quest first.`
      });
    }

    // Get user's X identity
    const { data: xIdentity, error: identityError } = await supabase
      .from('akari_user_identities')
      .select('provider_user_id, username')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .single();

    if (identityError || !xIdentity) {
      return res.status(400).json({ 
        ok: false, 
        error: 'X account not linked',
        details: 'Please link your X account to verify the quest.'
      });
    }

    const userXUsername = xIdentity.username;
    
    if (!userXUsername) {
      return res.status(400).json({ 
        ok: false, 
        error: 'X username not found',
        details: 'Your X account username could not be determined.'
      });
    }

    console.log(`[Promo Verify] Verifying quest for user @${userXUsername}`);

    // ==========================================================================
    // VERIFICATION STEP 1: Check if user follows @MysticHeros
    // ==========================================================================
    
    let isFollowing = false;
    try {
      isFollowing = await taioCheckFollowRelationship(userXUsername, TARGET_X_HANDLE);
      console.log(`[Promo Verify] Follow check: @${userXUsername} follows @${TARGET_X_HANDLE}? ${isFollowing}`);
    } catch (error) {
      console.error('[Promo Verify] Follow check error:', error);
      // Continue - we'll report failure at the end
    }

    // ==========================================================================
    // VERIFICATION STEP 2: Check for qualifying tweet (mentions @MysticHeros)
    // ==========================================================================
    
    let hasQualifyingTweet = false;
    try {
      // Try fetching user's recent tweets first
      const { tweets } = await taioGetUserLastTweets(userXUsername);
      
      // Look for a tweet that tags @MysticHeros
      for (const tweet of tweets) {
        const textLower = tweet.text.toLowerCase();
        const hasTag = textLower.includes(`@${TARGET_X_HANDLE.toLowerCase()}`);
        
        if (hasTag) {
          hasQualifyingTweet = true;
          console.log(`[Promo Verify] Found qualifying tweet: ${tweet.id}`);
          break;
        }
      }

      // If not found in user's tweets, try searching
      if (!hasQualifyingTweet) {
        // Search for tweets from this user mentioning @MysticHeros
        const searchQuery = `from:${userXUsername} @${TARGET_X_HANDLE}`;
        const { tweets: searchResults } = await taioAdvancedSearchTweets(searchQuery, 'Latest');
        
        if (searchResults.length > 0) {
          hasQualifyingTweet = true;
          console.log(`[Promo Verify] Found qualifying tweet via search: ${searchResults[0].id}`);
        }
      }
      
      console.log(`[Promo Verify] Tweet check: has qualifying tweet? ${hasQualifyingTweet}`);
    } catch (error) {
      console.error('[Promo Verify] Tweet check error:', error);
      // Continue - we'll report failure at the end
    }

    // ==========================================================================
    // CHECK RESULTS
    // ==========================================================================

    if (!isFollowing || !hasQualifyingTweet) {
      const missing: string[] = [];
      if (!isFollowing) missing.push(`follow @${TARGET_X_HANDLE}`);
      if (!hasQualifyingTweet) missing.push(`post a tweet mentioning @${TARGET_X_HANDLE}`);
      
      return res.status(200).json({
        ok: false,
        error: 'requirements_not_met',
        details: `Missing: ${missing.join(', ')}. Please complete these steps and try again.`
      });
    }

    // ==========================================================================
    // SUCCESS: Grant Analyst features for 3 days
    // ==========================================================================

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PROMO_DURATION_DAYS * 24 * 60 * 60 * 1000);

    console.log(`[Promo Verify] Granting Analyst features until ${expiresAt.toISOString()}`);

    // Grant each Analyst feature
    for (const featureKey of ANALYST_FEATURE_KEYS) {
      // Check if grant already exists
      const { data: existingGrant } = await supabase
        .from('akari_user_feature_grants')
        .select('id, ends_at')
        .eq('user_id', userId)
        .eq('feature_key', featureKey)
        .single();

      if (existingGrant) {
        // Only update if new expiry is later than existing
        const existingEndsAt = existingGrant.ends_at ? new Date(existingGrant.ends_at) : null;
        
        if (!existingEndsAt || existingEndsAt < expiresAt) {
          await supabase
            .from('akari_user_feature_grants')
            .update({
              starts_at: now.toISOString(),
              ends_at: expiresAt.toISOString(),
            })
            .eq('id', existingGrant.id);
        }
        // If existing grant has later expiry, don't shorten it
      } else {
        // Create new grant
        await supabase
          .from('akari_user_feature_grants')
          .insert({
            user_id: userId,
            feature_key: featureKey,
            starts_at: now.toISOString(),
            ends_at: expiresAt.toISOString(),
          });
      }
    }

    // Update promo record
    const { error: updateError } = await supabase
      .from('analyst_social_boost_promo')
      .update({
        status: 'completed',
        activated_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('[Promo Verify] Promo update error:', updateError);
      // Don't fail - grants were already created
    }

    console.log(`[Promo Verify] Quest completed successfully for user ${userId}`);

    return res.status(200).json({
      ok: true,
      grantedUntil: expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error('[Promo Verify API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

