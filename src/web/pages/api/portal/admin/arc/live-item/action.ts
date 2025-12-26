/**
 * API Route: POST /api/portal/admin/arc/live-item/action
 * 
 * Generic endpoint for pausing, restarting, ending, or reinstating live items (arenas, campaigns, gamified programs).
 * Super admin only.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isSuperAdminServerSide } from '@/lib/server-auth';

type ActionResponse =
  | { ok: true; status: string; startsAt: string | null; endsAt: string | null }
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
  res: NextApiResponse<ActionResponse>
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

    const { kind, id, action } = req.body as {
      kind?: 'arena' | 'campaign' | 'gamified';
      id?: string;
      action?: 'pause' | 'restart' | 'end' | 'reinstate';
    };

    if (!kind || !['arena', 'campaign', 'gamified'].includes(kind)) {
      return res.status(400).json({ ok: false, error: 'kind must be "arena", "campaign", or "gamified"' });
    }

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'id is required' });
    }

    if (!action || !['pause', 'restart', 'end', 'reinstate'].includes(action)) {
      return res.status(400).json({ ok: false, error: 'action must be "pause", "restart", "end", or "reinstate"' });
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    if (kind === 'arena') {
      // Handle arena actions
      const { data: arena, error: fetchError } = await supabase
        .from('arenas')
        .select('id, status, starts_at, ends_at')
        .eq('id', id)
        .single();

      if (fetchError || !arena) {
        return res.status(404).json({ ok: false, error: 'Arena not found' });
      }

      let newStatus: string;
      let updateData: any = { updated_at: now };

      if (action === 'pause') {
        // Use 'cancelled' as pause status for arenas (safest approach)
        newStatus = 'cancelled';
        updateData.status = newStatus;
      } else if (action === 'restart') {
        newStatus = 'active';
        updateData.status = newStatus;
      } else if (action === 'end') {
        newStatus = 'ended';
        updateData.status = newStatus;
        if (!arena.ends_at || new Date(arena.ends_at) > new Date()) {
          updateData.ends_at = now;
        }
      } else if (action === 'reinstate') {
        newStatus = 'active';
        updateData.status = newStatus;
        // Optionally clear ends_at if it's in the past
        if (arena.ends_at && new Date(arena.ends_at) < new Date()) {
          updateData.ends_at = null;
        }
      } else {
        return res.status(400).json({ ok: false, error: 'Invalid action for arena' });
      }

      const { error: updateError } = await supabase
        .from('arenas')
        .update(updateData)
        .eq('id', id);

      if (updateError) {
        console.error('[Live Item Action API] Error updating arena:', updateError);
        return res.status(500).json({ ok: false, error: 'Failed to update arena' });
      }

      // Fetch updated arena to return current state
      const { data: updatedArena } = await supabase
        .from('arenas')
        .select('status, starts_at, ends_at')
        .eq('id', id)
        .single();

      return res.status(200).json({
        ok: true,
        status: updatedArena?.status || newStatus,
        startsAt: updatedArena?.starts_at || null,
        endsAt: updatedArena?.ends_at || null,
      });
    } else if (kind === 'campaign') {
      // Handle campaign actions
      const { data: campaign, error: fetchError } = await supabase
        .from('arc_campaigns')
        .select('id, status, start_at, end_at')
        .eq('id', id)
        .single();

      if (fetchError || !campaign) {
        return res.status(404).json({ ok: false, error: 'Campaign not found' });
      }

      let newStatus: string;
      let updateData: any = { updated_at: now };

      if (action === 'pause') {
        newStatus = 'paused';
        updateData.status = newStatus;
      } else if (action === 'restart') {
        newStatus = 'live';
        updateData.status = newStatus;
      } else if (action === 'end') {
        newStatus = 'ended';
        updateData.status = newStatus;
        if (!campaign.end_at || new Date(campaign.end_at) > new Date()) {
          updateData.end_at = now;
        }
      } else if (action === 'reinstate') {
        newStatus = 'live';
        updateData.status = newStatus;
      } else {
        return res.status(400).json({ ok: false, error: 'Invalid action for campaign' });
      }

      const { error: updateError } = await supabase
        .from('arc_campaigns')
        .update(updateData)
        .eq('id', id);

      if (updateError) {
        console.error('[Live Item Action API] Error updating campaign:', updateError);
        return res.status(500).json({ ok: false, error: 'Failed to update campaign' });
      }

      // Fetch updated campaign to return current state
      const { data: updatedCampaign } = await supabase
        .from('arc_campaigns')
        .select('status, start_at, end_at')
        .eq('id', id)
        .single();

      return res.status(200).json({
        ok: true,
        status: updatedCampaign?.status || newStatus,
        startsAt: updatedCampaign?.start_at || null,
        endsAt: updatedCampaign?.end_at || null,
      });
    } else if (kind === 'gamified') {
      // Handle gamified program actions (creator_manager_programs)
      const { data: program, error: fetchError } = await supabase
        .from('creator_manager_programs')
        .select('id, status, start_at, end_at')
        .eq('id', id)
        .single();

      if (fetchError || !program) {
        return res.status(404).json({ ok: false, error: 'Program not found' });
      }

      let newStatus: string;
      let updateData: any = { updated_at: now };

      if (action === 'pause') {
        newStatus = 'paused';
        updateData.status = newStatus;
      } else if (action === 'restart') {
        newStatus = 'active';
        updateData.status = newStatus;
      } else if (action === 'end') {
        newStatus = 'ended';
        updateData.status = newStatus;
        if (!program.end_at || new Date(program.end_at) > new Date()) {
          updateData.end_at = now;
        }
      } else if (action === 'reinstate') {
        newStatus = 'active';
        updateData.status = newStatus;
      } else {
        return res.status(400).json({ ok: false, error: 'Invalid action for program' });
      }

      const { error: updateError } = await supabase
        .from('creator_manager_programs')
        .update(updateData)
        .eq('id', id);

      if (updateError) {
        console.error('[Live Item Action API] Error updating program:', updateError);
        return res.status(500).json({ ok: false, error: 'Failed to update program' });
      }

      // Fetch updated program to return current state
      const { data: updatedProgram } = await supabase
        .from('creator_manager_programs')
        .select('status, start_at, end_at')
        .eq('id', id)
        .single();

      return res.status(200).json({
        ok: true,
        status: updatedProgram?.status || newStatus,
        startsAt: updatedProgram?.start_at || null,
        endsAt: updatedProgram?.end_at || null,
      });
    }

    return res.status(400).json({ ok: false, error: 'Invalid kind' });
  } catch (error: any) {
    console.error('[Live Item Action API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

