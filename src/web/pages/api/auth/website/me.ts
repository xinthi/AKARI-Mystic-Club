/**
 * Website Auth - Get Current User
 *
 * Returns the currently logged-in user's info including roles and feature grants.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Create Supabase client
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Parse session cookie
function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const sessionToken = getSessionToken(req);

  if (!sessionToken) {
    return res.status(200).json({ ok: false, user: null });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Find session
    const { data: session, error: sessionError } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      return res.status(200).json({ ok: false, user: null });
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      // Clean up expired session
      await supabase
        .from('akari_user_sessions')
        .delete()
        .eq('session_token', sessionToken);
      return res.status(200).json({ ok: false, user: null });
    }

    // Get user info (including Mystic Identity fields)
    const { data: user, error: userError } = await supabase
      .from('akari_users')
      .select('id, display_name, avatar_url, is_active, persona_type, persona_tag, telegram_connected')
      .eq('id', session.user_id)
      .single();

    if (userError || !user || !user.is_active) {
      return res.status(200).json({ ok: false, user: null });
    }

    // Get X identity for username
    const { data: xIdentity } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', user.id)
      .eq('provider', 'x')
      .single();

    // Get user roles
    const { data: roles } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', user.id);

    // Get feature grants
    const { data: grants } = await supabase
      .from('akari_user_feature_grants')
      .select('id, feature_key, starts_at, ends_at, discount_percent, discount_note')
      .eq('user_id', user.id);

    return res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        roles: roles?.map(r => r.role) || ['user'],
        featureGrants: grants || [],
        xUsername: xIdentity?.username || null,
        // Mystic Identity fields
        personaType: user.persona_type || 'individual',
        personaTag: user.persona_tag || null,
        telegramConnected: user.telegram_connected ?? false,
      },
    });

  } catch (error: any) {
    console.error('[Auth /me] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

