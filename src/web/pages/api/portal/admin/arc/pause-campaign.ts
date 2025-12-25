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

    const { projectId, requestId } = req.body;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    const supabase = getSupabaseAdmin();

    // If requestId is provided, pause only the specific arena/campaign for that request
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

      if (request.requested_arc_access_level === 'creator_manager') {
        // For CRM: Find and pause the specific campaign
        const { data: campaigns } = await supabase
          .from('arc_campaigns')
          .select('id, created_at')
          .eq('project_id', request.project_id)
          .in('status', ['live'])
          .order('created_at', { ascending: false });

        if (campaigns && campaigns.length > 0 && request.decided_at) {
          const decidedAt = new Date(request.decided_at).getTime();
          interface CampaignItem {
            id: string;
            created_at: string;
            status: 'live';
          }
          let targetCampaign: CampaignItem | null = null;
          let minTimeDiff = Infinity;

          for (const c of campaigns) {
            const campaign = c as CampaignItem;
            const campaignTime = new Date(campaign.created_at).getTime();
            const timeDiff = Math.abs(campaignTime - decidedAt);
            if (timeDiff < 3600000 && timeDiff < minTimeDiff) {
              minTimeDiff = timeDiff;
              targetCampaign = campaign;
            }
          }

          if (targetCampaign === null && campaigns.length > 0) {
            targetCampaign = campaigns[0] as CampaignItem; // Fallback to most recent
          }

          if (targetCampaign !== null) {
            const { error: updateError } = await supabase
              .from('arc_campaigns')
              .update({ status: 'paused' })
              .eq('id', targetCampaign.id);

            if (updateError) {
              console.error('[Pause Campaign API] Error pausing campaign:', updateError);
              return res.status(500).json({ ok: false, error: 'Failed to pause campaign' });
            }

            return res.status(200).json({
              ok: true,
              message: 'Campaign paused',
              pausedCount: 1,
            });
          }
        }

        return res.status(200).json({
          ok: true,
          message: 'No active campaign found for this request',
          pausedCount: 0,
        });
      } else {
        // For Leaderboard/Gamified: Find and pause the specific arena (use cancelled as pause)
        const { data: arenas } = await supabase
          .from('arenas')
          .select('id, created_at')
          .eq('project_id', request.project_id)
          .in('status', ['draft', 'scheduled', 'active'])
          .order('created_at', { ascending: false });

        if (arenas && arenas.length > 0 && request.decided_at) {
          const decidedAt = new Date(request.decided_at).getTime();
          interface ArenaItem {
            id: string;
            created_at: string;
            status: 'draft' | 'scheduled' | 'active';
          }
          let targetArena: ArenaItem | null = null;
          let minTimeDiff = Infinity;

          for (const a of arenas) {
            const arena = a as ArenaItem;
            const arenaTime = new Date(arena.created_at).getTime();
            const timeDiff = Math.abs(arenaTime - decidedAt);
            if (timeDiff < 3600000 && timeDiff < minTimeDiff) {
              minTimeDiff = timeDiff;
              targetArena = arena;
            }
          }

          if (targetArena === null && arenas.length > 0) {
            targetArena = arenas[0] as ArenaItem; // Fallback to most recent
          }

          if (targetArena !== null) {
            const { error: updateError } = await supabase
              .from('arenas')
              .update({ status: 'cancelled' })
              .eq('id', targetArena.id);

            if (updateError) {
              console.error('[Pause Campaign API] Error pausing arena:', updateError);
              return res.status(500).json({ ok: false, error: 'Failed to pause arena' });
            }

            return res.status(200).json({
              ok: true,
              message: 'Arena paused',
              pausedCount: 1,
            });
          }
        }

        return res.status(200).json({
          ok: true,
          message: 'No active arena found for this request',
          pausedCount: 0,
        });
      }
    }

    // Legacy: If no requestId, pause all for project (backward compatibility)
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

