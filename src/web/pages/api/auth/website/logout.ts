/**
 * Website Auth - Logout
 *
 * Clears the session and removes the cookie.
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
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const sessionToken = getSessionToken(req);

  if (sessionToken) {
    try {
      const supabase = getSupabaseAdmin();
      
      // Delete session from database
      await supabase
        .from('akari_user_sessions')
        .delete()
        .eq('session_token', sessionToken);
    } catch (error) {
      console.error('[Auth logout] Failed to delete session:', error);
    }
  }

  // Clear cookie
  const cookieOptions = [
    `akari_session=`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=0`, // Expire immediately
  ];
  
  if (process.env.NODE_ENV === 'production') {
    cookieOptions.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieOptions.join('; '));

  return res.status(200).json({ ok: true });
}

