/**
 * Cron API Route: Promo Cleanup
 * 
 * Optional housekeeping job to mark expired promo grants.
 * Note: The permission system already ignores expired grants via ends_at check,
 * so this is mainly for analytics/tracking purposes.
 * 
 * Security: Requires CRON_SECRET in query param.
 * 
 * Usage: GET /api/cron/promo-cleanup?token=CRON_SECRET
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const token = req.query.token;

    // Protect with CRON_SECRET
    if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    console.log('[CRON] Starting promo cleanup...');

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    // Find completed promos that have expired
    // We don't change their status - 'completed' is fine for historical tracking
    // This query is mainly for logging/monitoring purposes
    const { data: expiredPromos, error: queryError } = await supabase
      .from('analyst_social_boost_promo')
      .select('id, user_id, expires_at')
      .eq('status', 'completed')
      .lt('expires_at', now);

    if (queryError) {
      console.error('[CRON] Promo cleanup query error:', queryError);
      return res.status(500).json({ ok: false, error: 'Query failed' });
    }

    const expiredCount = expiredPromos?.length || 0;
    console.log(`[CRON] Found ${expiredCount} expired promo(s)`);

    // Note: We're NOT deleting the expired feature grants because:
    // 1. The permission system already ignores them via ends_at check
    // 2. Keeping them provides an audit trail
    // 3. Some users might have other grants for the same features

    // Optionally: clean up very old expired grants (e.g., older than 30 days)
    // This is disabled by default to preserve audit trail
    // Uncomment if you want aggressive cleanup:
    /*
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { error: deleteError } = await supabase
      .from('akari_user_feature_grants')
      .delete()
      .in('feature_key', ['markets.analytics', 'sentiment.compare', 'sentiment.search'])
      .lt('ends_at', thirtyDaysAgo);

    if (deleteError) {
      console.error('[CRON] Grant cleanup error:', deleteError);
    }
    */

    console.log('[CRON] Promo cleanup complete.');

    return res.status(200).json({
      ok: true,
      message: 'Promo cleanup completed.',
      expiredPromos: expiredCount,
    });
  } catch (error: any) {
    console.error('[CRON] Promo cleanup failed:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}

