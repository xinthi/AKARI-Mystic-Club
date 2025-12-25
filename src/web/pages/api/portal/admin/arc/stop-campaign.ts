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

    const { projectId, requestId } = req.body;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    const supabase = getSupabaseAdmin();

    // If requestId is provided, end only the specific arena/campaign for that request
    if (requestId && typeof requestId === 'string') {
      // Get request details to find the specific arena/campaign
      const { data: request, error: requestError } = await supabase
        .from('arc_leaderboard_requests')
        .select('id, project_id, requested_arc_access_level, decided_at')
        .eq('id', requestId)
        .single();

      if (requestError || !request) {
        return res.status(404).json({ ok: false, error: 'Request not found' });
      }

      if (!request.decided_at) {
        return res.status(400).json({ ok: false, error: 'Request has no decided_at timestamp' });
      }

      if (request.requested_arc_access_level === 'creator_manager') {
        // For CRM: Find and end the specific campaign
        // Match by: same project_id AND created_at closest to request decided_at (within 1 hour window)
        const { data: campaigns } = await supabase
          .from('arc_campaigns')
          .select('id, created_at, status')
          .eq('project_id', request.project_id)
          .in('status', ['live', 'paused'])
          .order('created_at', { ascending: false });

        if (!campaigns || campaigns.length === 0) {
          return res.status(200).json({
            ok: true,
            message: 'No active campaign found for this request',
            stoppedCount: 0,
          });
        }

        const decidedAt = new Date(request.decided_at).getTime();
        interface CampaignItem {
          id: string;
          created_at: string;
          status: 'live' | 'paused';
        }
        let targetCampaign: CampaignItem | null = null;
        let minTimeDiff = Infinity;

        // Find campaign created closest to decided_at (within 1 hour window)
        for (const c of campaigns) {
          const campaign = c as CampaignItem;
          const campaignTime = new Date(campaign.created_at).getTime();
          const timeDiff = Math.abs(campaignTime - decidedAt);
          // Match if created within 1 hour of approval
          if (timeDiff < 3600000 && timeDiff < minTimeDiff) {
            minTimeDiff = timeDiff;
            targetCampaign = campaign;
          }
        }

        // If no campaign found near approval time, don't fallback - this ensures we only end the specific one
        if (targetCampaign === null) {
          return res.status(404).json({
            ok: false,
            error: 'No campaign found that matches this request (created within 1 hour of approval). This request may not have an associated campaign.',
          });
        }

        // End only this specific campaign
        const { error: updateError } = await supabase
          .from('arc_campaigns')
          .update({ status: 'ended' })
          .eq('id', targetCampaign.id);

        if (updateError) {
          console.error('[Stop Campaign API] Error ending campaign:', updateError);
          return res.status(500).json({ ok: false, error: 'Failed to end campaign' });
        }

        return res.status(200).json({
          ok: true,
          message: 'Campaign ended',
          stoppedCount: 1,
        });
      } else {
        // For Leaderboard/Gamified: Find and end the specific arena
        // Match by: same project_id AND created_at closest to request decided_at (within 1 hour window)
        const { data: arenas } = await supabase
          .from('arenas')
          .select('id, created_at, status')
          .eq('project_id', request.project_id)
          .in('status', ['draft', 'scheduled', 'active'])
          .order('created_at', { ascending: false });

        if (!arenas || arenas.length === 0) {
          return res.status(200).json({
            ok: true,
            message: 'No active arena found for this request',
            stoppedCount: 0,
          });
        }

        const decidedAt = new Date(request.decided_at).getTime();
        interface ArenaItem {
          id: string;
          created_at: string;
          status: 'draft' | 'scheduled' | 'active';
        }
        let targetArena: ArenaItem | null = null;
        let minTimeDiff = Infinity;

        // Find arena created closest to decided_at (within 1 hour window)
        for (const a of arenas) {
          const arena = a as ArenaItem;
          const arenaTime = new Date(arena.created_at).getTime();
          const timeDiff = Math.abs(arenaTime - decidedAt);
          // Match if created within 1 hour of approval
          if (timeDiff < 3600000 && timeDiff < minTimeDiff) {
            minTimeDiff = timeDiff;
            targetArena = arena;
          }
        }

        // If no arena found near approval time, don't fallback - this ensures we only end the specific one
        if (targetArena === null) {
          return res.status(404).json({
            ok: false,
            error: 'No arena found that matches this request (created within 1 hour of approval). This request may not have an associated arena.',
          });
        }

        // End only this specific arena (use 'ended' status for consistency with campaigns)
        const { error: updateError } = await supabase
          .from('arenas')
          .update({ status: 'ended' })
          .eq('id', targetArena.id);

        if (updateError) {
          console.error('[Stop Campaign API] Error ending arena:', updateError);
          return res.status(500).json({ ok: false, error: 'Failed to end arena' });
        }

        return res.status(200).json({
          ok: true,
          message: 'Arena ended',
          stoppedCount: 1,
        });
      }
    }

    // Legacy: If no requestId, end all arenas for project (backward compatibility)
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

