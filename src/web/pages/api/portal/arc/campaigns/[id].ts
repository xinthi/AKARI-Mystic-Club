/**
 * API Route: GET /api/portal/arc/campaigns/[id]
 * 
 * Get a single ARC campaign by ID.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// =============================================================================
// TYPES
// =============================================================================

interface Campaign {
  id: string;
  project_id: string;
  type: string;
  participation_mode: string;
  leaderboard_visibility: string;
  name: string;
  brief_objective: string | null;
  start_at: string;
  end_at: string;
  website_url: string | null;
  docs_url: string | null;
  reward_pool_text: string | null;
  winners_count: number;
  status: string;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

type CampaignResponse =
  | { ok: true; campaign: Campaign }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CampaignResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Campaign ID is required' });
    }

    const { data: campaign, error: fetchError } = await supabase
      .from('arc_campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    return res.status(200).json({
      ok: true,
      campaign: campaign as Campaign,
    });
  } catch (error: any) {
    console.error('[ARC Campaign API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}



