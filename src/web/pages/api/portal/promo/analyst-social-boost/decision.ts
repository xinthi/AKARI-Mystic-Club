/**
 * API Route: POST /api/portal/promo/analyst-social-boost/decision
 * 
 * Handles user decisions for the Analyst Social Boost promo:
 * - accept: User wants to start the quest
 * - skip: User wants to see it later (48h first time, 7d after)
 * - never: User never wants to see it again
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

type DecisionAction = 'accept' | 'skip' | 'never';

type PromoDecisionResponse =
  | {
      ok: true;
      status: string;
      nextShowAt: string | null;
    }
  | { ok: false; error: string };

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
  res: NextApiResponse<PromoDecisionResponse>
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

    const { action } = req.body as { action?: DecisionAction };

    if (!action || !['accept', 'skip', 'never'].includes(action)) {
      return res.status(400).json({ ok: false, error: 'Invalid action. Must be accept, skip, or never.' });
    }

    // Load promo record
    const { data: promo, error: promoError } = await supabase
      .from('analyst_social_boost_promo')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (promoError) {
      console.error('[Promo Decision API] Query error:', promoError);
      return res.status(404).json({ ok: false, error: 'Promo record not found. Call status endpoint first.' });
    }

    const now = new Date();
    let newStatus = promo.status;
    let newTimesDeclined = promo.times_declined;
    let newNextShowAt: Date | null = promo.next_show_at ? new Date(promo.next_show_at) : null;

    switch (action) {
      case 'accept':
        newStatus = 'accepted';
        // Don't change next_show_at - user is actively engaged
        break;

      case 'skip':
        newTimesDeclined += 1;
        newStatus = 'declined_recently';
        
        if (newTimesDeclined === 1) {
          // First skip: show again in 48 hours
          newNextShowAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        } else {
          // Subsequent skips: show again in 7 days
          newNextShowAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        }
        break;

      case 'never':
        newStatus = 'declined_long_term';
        newNextShowAt = null;
        break;
    }

    // Update promo record
    const { error: updateError } = await supabase
      .from('analyst_social_boost_promo')
      .update({
        status: newStatus,
        times_declined: newTimesDeclined,
        next_show_at: newNextShowAt ? newNextShowAt.toISOString() : null,
        last_shown_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('[Promo Decision API] Update error:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to update promo state' });
    }

    return res.status(200).json({
      ok: true,
      status: newStatus,
      nextShowAt: newNextShowAt ? newNextShowAt.toISOString() : null,
    });
  } catch (error: any) {
    console.error('[Promo Decision API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

