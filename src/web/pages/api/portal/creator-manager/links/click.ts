/**
 * API Route: POST /api/portal/creator-manager/links/click
 * 
 * Log a click on a Creator Manager link
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ok: boolean; error?: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const { linkId, programId, creatorProfileId, userAgent, referrer } = req.body;

  if (!linkId || !programId) {
    return res.status(400).json({ ok: false, error: 'linkId and programId are required' });
  }

  try {
    await supabase
      .from('creator_manager_link_clicks')
      .insert({
        link_id: linkId,
        program_id: programId,
        creator_profile_id: creatorProfileId || null,
        user_agent: userAgent || null,
        referrer: referrer || null,
      });

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('[Link Click] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

