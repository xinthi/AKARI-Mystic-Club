/**
 * API Route: POST /api/portal/admin/arc/stop-campaign
 * 
 * Stop/pause all active campaigns (arenas) for a project (Super Admin only).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/server-auth';

type StopCampaignResponse =
  | { ok: true; message: string; stoppedCount: number }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StopCampaignResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Check super admin authentication
    const adminProfile = await requireSuperAdmin(req, res);
    if (!adminProfile) {
      return; // Response already sent
    }

    const { projectId } = req.body;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    const supabase = getSupabaseAdmin();

    // Get all active arenas for this project
    const { data: activeArenas, error: fetchError } = await supabase
      .from('arenas')
      .select('id, name')
      .eq('project_id', projectId)
      .in('status', ['draft', 'scheduled', 'active']);

    if (fetchError) {
      console.error('[Stop Campaign API] Error fetching arenas:', fetchError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch campaigns' });
    }

    if (!activeArenas || activeArenas.length === 0) {
      return res.status(200).json({
        ok: true,
        message: 'No active campaigns to stop',
        stoppedCount: 0,
      });
    }

    // Update all active arenas to cancelled status
    const { error: updateError } = await supabase
      .from('arenas')
      .update({ status: 'cancelled' })
      .eq('project_id', projectId)
      .in('status', ['draft', 'scheduled', 'active']);

    if (updateError) {
      console.error('[Stop Campaign API] Error updating arenas:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to stop campaigns' });
    }

    return res.status(200).json({
      ok: true,
      message: `Stopped ${activeArenas.length} campaign(s)`,
      stoppedCount: activeArenas.length,
    });
  } catch (error: any) {
    console.error('[Stop Campaign API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

