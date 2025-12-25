/**
 * API Route: POST /api/portal/admin/arc/stop-campaign
 * 
 * Stop/pause all active campaigns (arenas) for a project (Super Admin only).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isSuperAdminServerSide } from '@/lib/server-auth';

type StopCampaignResponse =
  | { ok: true; message: string; stoppedCount: number }
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
  res: NextApiResponse<StopCampaignResponse>
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

