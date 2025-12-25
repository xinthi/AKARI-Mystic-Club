/**
 * API Route: POST /api/portal/admin/arc/pause-campaign
 * 
 * Pause all active campaigns (arenas and arc_campaigns) for a project (Super Admin only).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isSuperAdminServerSide } from '@/lib/server-auth';

type PauseCampaignResponse =
  | { ok: true; message: string; pausedCount: number }
  | { ok: false; error: string };

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

async function getUserIdFromSession(sessionToken: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: session, error } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (error || !session) {
      return null;
    }

    if (new Date(session.expires_at) < new Date()) {
      await supabase.from('akari_user_sessions').delete().eq('session_token', sessionToken);
      return null;
    }

    return session.user_id;
  } catch (err) {
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PauseCampaignResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Check authentication
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const userId = await getUserIdFromSession(sessionToken);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    // Check super admin
    const isSuperAdmin = await isSuperAdminServerSide(userId);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
    }

    const { projectId } = req.body;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    const supabase = getSupabaseAdmin();

    // Pause arenas (use 'cancelled' as temporary pause status since 'paused' isn't in enum yet)
    const { data: activeArenas, error: arenasFetchError } = await supabase
      .from('arenas')
      .select('id')
      .eq('project_id', projectId)
      .in('status', ['draft', 'scheduled', 'active']);

    let pausedArenasCount = 0;
    if (!arenasFetchError && activeArenas && activeArenas.length > 0) {
      const { error: arenasUpdateError } = await supabase
        .from('arenas')
        .update({ status: 'cancelled' })
        .eq('project_id', projectId)
        .in('status', ['draft', 'scheduled', 'active']);

      if (arenasUpdateError) {
        console.error('[Pause Campaign API] Error pausing arenas:', arenasUpdateError);
      } else {
        pausedArenasCount = activeArenas.length;
      }
    }

    // Pause campaigns
    const { data: activeCampaigns, error: campaignsFetchError } = await supabase
      .from('arc_campaigns')
      .select('id')
      .eq('project_id', projectId)
      .in('status', ['live']);

    let pausedCampaignsCount = 0;
    if (!campaignsFetchError && activeCampaigns && activeCampaigns.length > 0) {
      const { error: campaignsUpdateError } = await supabase
        .from('arc_campaigns')
        .update({ status: 'paused' })
        .eq('project_id', projectId)
        .in('status', ['live']);

      if (campaignsUpdateError) {
        console.error('[Pause Campaign API] Error pausing campaigns:', campaignsUpdateError);
      } else {
        pausedCampaignsCount = activeCampaigns.length;
      }
    }

    const totalPaused = pausedArenasCount + pausedCampaignsCount;

    if (totalPaused === 0) {
      return res.status(200).json({
        ok: true,
        message: 'No active campaigns to pause',
        pausedCount: 0,
      });
    }

    return res.status(200).json({
      ok: true,
      message: `Paused ${totalPaused} campaign(s)`,
      pausedCount: totalPaused,
    });
  } catch (error: any) {
    console.error('[Pause Campaign API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

